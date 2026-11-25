import { assertEquals } from "jsr:@std/assert@1";
import { processDueJobs } from "../../supabase/functions/_shared/jobs.ts";
import type { Sql } from "../../supabase/functions/_shared/db.ts";
import type { JobRow } from "../../supabase/functions/_shared/types.ts";

function job(key: string, attempts = 0, maxAttempts = 5): JobRow {
  return {
    id: crypto.randomUUID(),
    type: "discord_source_alert",
    idempotency_key: key,
    payload: { title: key, message: "test alert" },
    status: "claimed",
    priority: 100,
    attempts,
    max_attempts: maxAttempts,
    run_at: new Date().toISOString(),
    leased_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
    lease_owner: "test-worker",
    last_error: null,
    last_response_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };
}

function fakeSql(jobs: JobRow[], failCompletionFor = new Set<string>()) {
  const completionCalls: string[] = [];
  const outcomes: unknown[] = [];

  async function tagged(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    await Promise.resolve();
    const text = strings.join("?");
    if (text.includes("mark_expired_claims_ambiguous")) {
      return [{ mark_expired_claims_ambiguous: 0 }];
    }
    if (text.includes("claim_due_jobs")) return jobs;
    if (text.includes("complete_job")) {
      const jobId = String(values[0]);
      const key = jobs.find((row) => row.id === jobId)?.idempotency_key ?? jobId;
      completionCalls.push(key);
      outcomes.push(values[2]);
      if (failCompletionFor.has(key)) throw new Error("injected completion failure");
      return [];
    }
    throw new Error(`unexpected SQL: ${text}`);
  }

  const sql = Object.assign(tagged, { json: (value: unknown) => value }) as unknown as Sql;
  return { sql, completionCalls, outcomes };
}

async function withMockedDiscord(run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      embeds?: Array<{ footer?: { text?: string } }>;
    };
    const footer = body.embeds?.[0]?.footer?.text ?? "";
    if (footer.includes("job-success")) return Promise.resolve(new Response(null, { status: 204 }));
    if (footer.includes("job-retry")) return Promise.resolve(new Response("unavailable", { status: 503 }));
    if (footer.includes("job-permanent")) return Promise.resolve(new Response("bad request", { status: 400 }));
    if (footer.includes("job-ambiguous")) {
      return Promise.reject(new DOMException("aborted", "AbortError"));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("processDueJobs maps every Discord outcome into summary counters", async () => {
  const jobs = [
    job("job-success"),
    job("job-retry", 1, 5),
    job("job-retry-exhausted", 5, 5),
    job("job-permanent"),
    job("job-ambiguous"),
  ];
  const harness = fakeSql(jobs);

  await withMockedDiscord(async () => {
    const summary = await processDueJobs(harness.sql, "test-worker", "https://discord.test/webhook", 10);
    assertEquals(summary, {
      expiredClaimsMarkedAmbiguous: 0,
      claimed: 5,
      succeeded: 1,
      retryScheduled: 1,
      ambiguous: 1,
      deadLettered: 2,
      completionErrors: 0,
    });
  });

  assertEquals(harness.completionCalls.length, 5);
  assertEquals(harness.outcomes, [
    "success",
    "retryable_failure",
    "retryable_failure",
    "permanent_failure",
    "ambiguous",
  ]);
});

Deno.test("a completion failure does not abandon the remaining claimed batch", async () => {
  const jobs = [job("job-permanent"), job("job-success")];
  const failing = new Set(["job-permanent"]);
  const harness = fakeSql(jobs, failing);

  await withMockedDiscord(async () => {
    const summary = await processDueJobs(harness.sql, "test-worker", "https://discord.test/webhook", 10);
    assertEquals(summary.completionErrors, 1);
    assertEquals(summary.succeeded, 1);
  });

  assertEquals(harness.completionCalls, ["job-permanent", "job-success"]);
});
