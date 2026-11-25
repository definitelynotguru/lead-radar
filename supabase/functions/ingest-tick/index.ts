import { hasValidSharedSecret } from "../_shared/auth.ts";
import { createDatabase, readRuntimeEnv } from "../_shared/db.ts";
import { jsonResponse } from "../_shared/http.ts";
import { pingExternalHeartbeat, runDueIngestion } from "../_shared/ingest.ts";
import { processDueJobs } from "../_shared/jobs.ts";
import { serveEntrypoint } from "../_shared/serve.ts";

const INGEST_ADVISORY_LOCK_KEY = 727272001;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 800) : "unknown ingest-tick error";
}

serveEntrypoint(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const env = readRuntimeEnv();
  const authorized = hasValidSharedSecret(request, env.ingestSecret, "x-lead-radar-secret");
  if (!authorized) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (!env.databaseUrl) {
    return jsonResponse({ error: "LEAD_RADAR_DATABASE_URL is not configured" }, 500);
  }

  const sql = createDatabase(env.databaseUrl);
  const workerId = crypto.randomUUID();

  try {
    const lockRows = await sql<Array<{ locked: boolean }>>`
      select pg_try_advisory_lock(${INGEST_ADVISORY_LOCK_KEY}) as locked
    `;
    if (!lockRows[0]?.locked) {
      return jsonResponse({ status: "skipped", reason: "another ingest tick holds the advisory lock" }, 200);
    }

    try {
      const ingestion = await runDueIngestion(sql, env);
      const jobs = await processDueJobs(sql, workerId, env.discordWebhookUrl);
      const degraded = ingestion.some((result) => result.status === "error");
      const heartbeatPinged = degraded ? false : await pingExternalHeartbeat(env.healthchecksPingUrl);

      return jsonResponse({
        status: degraded ? "degraded" : "ok",
        worker_id: workerId,
        ingestion,
        jobs,
        heartbeat: {
          configured: Boolean(env.healthchecksPingUrl),
          pinged: heartbeatPinged,
          suppressed_due_to_degraded_tick: degraded,
        },
      }, degraded ? 207 : 200);
    } finally {
      await sql`select pg_advisory_unlock(${INGEST_ADVISORY_LOCK_KEY})`;
    }
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500);
  } finally {
    await sql.end();
  }
});
