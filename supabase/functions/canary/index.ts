import { hasValidSharedSecret } from "../_shared/auth.ts";
import { createDatabase, readRuntimeEnv, type Sql } from "../_shared/db.ts";
import { enqueueOperationalJob } from "../_shared/health.ts";
import { jsonResponse } from "../_shared/http.ts";
import { pingExternalHeartbeat } from "../_shared/ingest.ts";
import { processDueJobs } from "../_shared/jobs.ts";
import { parseGitHubSearchResponse } from "../_shared/parsers/github.ts";
import { parseHnComment } from "../_shared/parsers/hn.ts";
import { parseRemotiveResponse } from "../_shared/parsers/remotive.ts";
import { serveEntrypoint } from "../_shared/serve.ts";
import { utcHourKey } from "../_shared/time.ts";

const CANARY_ADVISORY_LOCK_KEY = 727272002;

type CheckStatus = { ok: boolean; detail: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 800) : "unknown canary error";
}

function parserChecks(): Record<string, CheckStatus> {
  const hn = parseHnComment({
    id: 1,
    type: "comment",
    time: 1_700_000_000,
    text: "ExampleCo | TypeScript Engineer | REMOTE | $150k<p>Build useful things.",
  });
  const github = parseGitHubSearchResponse({
    items: [{
      id: 1,
      node_id: "I_example",
      number: 1,
      title: "$100 bounty: fix parser",
      body: "Reproduction details",
      html_url: "https://github.com/example/repo/issues/1",
      repository_url: "https://api.github.com/repos/example/repo",
      created_at: "2024-01-01T00:00:00Z",
      labels: [{ name: "bounty" }],
    }],
  });
  const remotive = parseRemotiveResponse({
    "0-legal-notice": "Remotive attribution fixture",
    jobs: [{
      id: 1,
      url: "https://remotive.com/remote-jobs/example",
      title: "Example remote role",
      company_name: "ExampleCo",
      publication_date: "2024-01-01T00:00:00Z",
      description: "<p>Remote work</p>",
    }],
  });

  return {
    hn_parser: { ok: hn?.company === "ExampleCo" && hn.remote === true, detail: hn ? "parsed" : "no lead produced" },
    github_parser: {
      ok: github.length === 1 && github[0].company === "example/repo",
      detail: `${github.length} lead(s)`,
    },
    remotive_parser: { ok: remotive.length === 1 && remotive[0].remote === true, detail: `${remotive.length} lead(s)` },
  };
}

async function freshnessChecks(sql: Sql): Promise<Record<string, CheckStatus>> {
  const rows = await sql<
    Array<
      {
        source: string;
        last_success_at: string | null;
        last_run_at: string | null;
        created_at: string;
        cadence_seconds: number;
      }
    >
  >`
    select source::text, last_success_at, last_run_at, created_at, cadence_seconds
    from source_states
    where enabled
  `;
  const maxAgeSeconds: Record<string, number> = { hn: 10 * 60, github: 10 * 60, remotive: 7 * 60 * 60 };
  const checks: Record<string, CheckStatus> = {};

  for (const row of rows) {
    const reference = row.last_success_at ?? row.created_at;
    const ageSeconds = (Date.now() - new Date(reference).getTime()) / 1000;
    const limit = maxAgeSeconds[row.source] ?? Math.max(row.cadence_seconds * 2, 10 * 60);
    checks[`${row.source}_freshness`] = {
      ok: ageSeconds <= limit,
      detail: row.last_success_at
        ? `last success ${Math.floor(ageSeconds / 60)} minutes ago`
        : "no successful ingestion recorded yet",
    };
  }

  return checks;
}

async function queueChecks(sql: Sql): Promise<Record<string, CheckStatus>> {
  const rows = await sql<Array<{ status: string; count: number }>>`
    select status::text, count(*)::integer as count
    from jobs
    group by status
  `;
  const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  const deadLetterRows = await sql<Array<{ count: number }>>`
    select count(*)::integer as count
    from dead_letters
  `;
  const backlog = (counts.pending ?? 0) + (counts.failed ?? 0);
  const ambiguous = counts.ambiguous ?? 0;
  const deadLetters = Number(deadLetterRows[0]?.count ?? 0);
  return {
    queue_backlog: {
      ok: backlog < 100,
      detail: `${backlog} pending/failed job(s), ${ambiguous} ambiguous, ${deadLetters} dead-lettered`,
    },
    queue_dead_letters: {
      ok: deadLetters === 0,
      detail: deadLetters === 0 ? "dead-letter queue empty" : `${deadLetters} job(s) require requeue or cancellation`,
    },
    queue_ambiguous: {
      ok: ambiguous === 0,
      detail: ambiguous === 0 ? "no ambiguous deliveries" : `${ambiguous} uncertain Discord delivery(ies) require inspection`,
    },
  };
}

async function alertForFailures(sql: Sql, checks: Record<string, CheckStatus>): Promise<void> {
  for (const [name, check] of Object.entries(checks)) {
    if (check.ok) continue;
    await enqueueOperationalJob(
      sql,
      "discord_canary_alert",
      `canary:${name}:${utcHourKey()}`,
      {
        title: `canary check failed: ${name}`,
        message: check.detail,
        check: name,
      },
      80,
      3,
    );
  }
}

serveEntrypoint(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const env = readRuntimeEnv();
  const authorized = hasValidSharedSecret(request, env.canarySecret, "x-lead-radar-secret");
  if (!authorized && !(env.allowInsecureLocal && !env.canarySecret)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (!env.databaseUrl) {
    return jsonResponse({ error: "LEAD_RADAR_DATABASE_URL is not configured" }, 500);
  }

  const sql = createDatabase(env.databaseUrl);
  let runId: string | undefined;

  try {
    const lockRows = await sql<Array<{ locked: boolean }>>`
      select pg_try_advisory_lock(${CANARY_ADVISORY_LOCK_KEY}) as locked
    `;
    if (!lockRows[0]?.locked) {
      return jsonResponse({ status: "skipped", reason: "another canary holds the advisory lock" }, 200);
    }

    try {
      const runRows = await sql<Array<{ id: string }>>`
        insert into canary_runs default values
        returning id
      `;
      runId = runRows[0]?.id;

      const checks: Record<string, CheckStatus> = {
        database_connectivity: { ok: true, detail: "canary row inserted" },
        database_url_configured: { ok: Boolean(env.databaseUrl), detail: env.databaseUrl ? "configured" : "missing" },
        discord_configured: {
          ok: Boolean(env.discordWebhookUrl),
          detail: env.discordWebhookUrl ? "configured" : "missing",
        },
        heartbeat_configured: {
          ok: Boolean(env.healthchecksPingUrl),
          detail: env.healthchecksPingUrl ? "configured" : "missing",
        },
        ...parserChecks(),
        ...await freshnessChecks(sql),
        ...await queueChecks(sql),
      };

      const failed = Object.entries(checks).filter(([, check]) => !check.ok);
      const persistenceProbe = await sql<Array<{ count: number }>>`
        select count(*)::integer as count
        from canary_runs
        where id = ${runId}::uuid
      `;
      checks.end_to_end_persistence = {
        ok: Number(persistenceProbe[0]?.count ?? 0) === 1,
        detail: "inserted canary row was readable in the same database",
      };

      const ok = Object.values(checks).every((check) => check.ok);
      await sql`
        update canary_runs
        set finished_at = now(),
            status = ${ok ? "success" : "failure"},
            checks = ${sql.json(checks)},
            error = ${failed.map(([name, check]) => `${name}: ${check.detail}`).join("; ") || null}::text
        where id = ${runId}::uuid
      `;

      if (!ok) await alertForFailures(sql, checks);
      const jobs = await processDueJobs(sql, `canary-${runId}`, env.discordWebhookUrl, 4);
      const heartbeatPinged = ok ? await pingExternalHeartbeat(env.healthchecksCanaryPingUrl) : false;

      return jsonResponse({
        status: ok ? "ok" : "failure",
        run_id: runId,
        checks,
        jobs,
        heartbeat: {
          configured: Boolean(env.healthchecksCanaryPingUrl),
          pinged: heartbeatPinged,
        },
      }, ok ? 200 : 207);
    } finally {
      await sql`select pg_advisory_unlock(${CANARY_ADVISORY_LOCK_KEY})`;
    }
  } catch (error) {
    const message = errorMessage(error);
    if (runId) {
      try {
        await sql`
          update canary_runs
          set finished_at = now(), status = 'failure', error = ${message}
          where id = ${runId}::uuid
        `;
      } catch {
        // The original database error is more important than the failure-to-record error.
      }
    }
    return jsonResponse({ error: message }, 500);
  } finally {
    await sql.end();
  }
});
