import { assert, assertEquals } from "jsr:@std/assert@1";
import { createDatabase, type Sql } from "../../supabase/functions/_shared/db.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

const sql = createDatabase(databaseUrl);

async function resetDatabase(tx: Sql = sql): Promise<void> {
  await tx`
    truncate dead_letters, job_attempts, jobs, outcomes, applications, leads, fetch_runs, canary_runs
    restart identity cascade
  `;
  await tx`
    update source_states
    set cursor = '{}'::jsonb,
        last_run_at = null,
        last_success_at = null,
        last_error_at = null,
        last_item_seen_at = null,
        consecutive_failures = 0,
        last_error = null
  `;
}

function testLead(externalId: string) {
  return {
    external_id: externalId,
    canonical_url: `https://example.test/${externalId}`,
    title: "Integration test lead",
    company: "ExampleCo",
    location: "REMOTE",
    salary: "$100k",
    description: "A durable queue integration test lead.",
    tags: ["TypeScript"],
    remote: true,
    posted_at: "2026-01-01T00:00:00.000Z",
    metadata: { test: true },
  };
}

Deno.test("Postgres queue semantics survive duplicates, retries, crashes, and outcome capture", async (t) => {
  try {
    await resetDatabase();

    await t.step("lead ingestion is idempotent and enqueues one deterministic alert job", async () => {
      const payload = [testLead("lead-1")];
      const first = await sql<Array<{ ingest_leads_batch: { inserted: number; duplicates: number } }>>`
        select ingest_leads_batch('hn'::lead_source, ${sql.json(payload)})
      `;
      const second = await sql<Array<{ ingest_leads_batch: { inserted: number; duplicates: number } }>>`
        select ingest_leads_batch('hn'::lead_source, ${sql.json(payload)})
      `;

      assertEquals(first[0].ingest_leads_batch.inserted, 1);
      assertEquals(second[0].ingest_leads_batch.inserted, 0);
      assertEquals(second[0].ingest_leads_batch.duplicates, 1);

      const counts = await sql<Array<{ leads: number; jobs: number; snippet: string }>>`
        select (select count(*)::integer from leads) as leads,
               (select count(*)::integer from jobs) as jobs,
               (select payload->>'description_snippet' from jobs limit 1) as snippet
      `;
      assertEquals(counts[0].leads, 1);
      assertEquals(counts[0].jobs, 1);
      assertEquals(counts[0].snippet, "A durable queue integration test lead.");
    });

    await t.step("bounded retries dead-letter exhausted jobs into a separate inspectable queue", async () => {
      await sql`truncate dead_letters, job_attempts, jobs restart identity cascade`;
      const inserted = await sql<Array<{ id: string }>>`
        insert into jobs (type, idempotency_key, payload, max_attempts)
        values ('discord_source_alert', 'test-dead-letter', '{}'::jsonb, 2)
        returning id
      `;
      const jobId = inserted[0].id;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await sql`update jobs set run_at = now() - interval '1 second' where id = ${jobId}::uuid`;
        const claimed = await sql<Array<{ id: string; attempts: number }>>`
          select id, attempts from claim_due_jobs('test-worker', 10, 120)
        `;
        assertEquals(claimed[0]?.id, jobId);
        assertEquals(claimed[0]?.attempts, attempt);
        await sql`
          select complete_job(
            ${jobId}::uuid,
            'test-worker',
            'retryable_failure',
            'simulated Discord 500',
            500,
            12,
            ${new Date(Date.now() + 1000).toISOString()}::timestamptz
          )
        `;
      }

      const finalRows = await sql<Array<{ status: string; dead_count: number; attempt_count: number }>>`
        select jobs.status::text as status,
               (select count(*)::integer from dead_letters where job_id = jobs.id) as dead_count,
               (select count(*)::integer from job_attempts where job_id = jobs.id) as attempt_count
        from jobs
        where id = ${jobId}::uuid
      `;
      assertEquals(finalRows[0].status, "dead_lettered");
      assertEquals(finalRows[0].dead_count, 1);
      assertEquals(finalRows[0].attempt_count, 2);
    });

    await t.step("an expired worker lease becomes ambiguous instead of being blindly reposted", async () => {
      await sql`truncate dead_letters, job_attempts, jobs restart identity cascade`;
      const inserted = await sql<Array<{ id: string }>>`
        insert into jobs (type, idempotency_key, payload, max_attempts)
        values ('discord_source_alert', 'test-crash-lease', '{}'::jsonb, 3)
        returning id
      `;
      const jobId = inserted[0].id;
      const claimed = await sql<Array<{ id: string }>>`
        select id from claim_due_jobs('crash-worker', 10, 120)
      `;
      assertEquals(claimed[0]?.id, jobId);

      await sql`update jobs set lease_expires_at = now() - interval '1 second' where id = ${jobId}::uuid`;
      const marked = await sql<Array<{ mark_expired_claims_ambiguous: number }>>`
        select mark_expired_claims_ambiguous()
      `;
      assertEquals(marked[0].mark_expired_claims_ambiguous, 1);

      const ambiguous = await sql<Array<{ status: string; error: string }>>`
        select jobs.status::text as status, job_attempts.status as error
        from jobs
        join job_attempts on job_attempts.job_id = jobs.id
        where jobs.id = ${jobId}::uuid
      `;
      assertEquals(ambiguous[0].status, "ambiguous");
      assertEquals(ambiguous[0].error, "ambiguous");

      let staleCompletionRejected = false;
      try {
        await sql`
          select complete_job(
            ${jobId}::uuid,
            'crash-worker',
            'success',
            null::text,
            204,
            10,
            null::timestamptz
          )
        `;
      } catch (error) {
        staleCompletionRejected = error instanceof Error && error.message.includes("not claimed by worker");
      }
      assert(staleCompletionRejected);

      const unchanged = await sql<Array<{ status: string }>>`
        select status::text from jobs where id = ${jobId}::uuid
      `;
      assertEquals(unchanged[0].status, "ambiguous");

      const requeued = await sql<Array<{ status: string; attempts: number }>>`
        select status::text, attempts
        from requeue_job(${jobId}::uuid, 0, true)
      `;
      assertEquals(requeued[0].status, "pending");
      assertEquals(requeued[0].attempts, 0);
    });

    await t.step("application actions upsert one application and preserve outcome history", async () => {
      const leadRows = await sql<Array<{ id: string }>>`select id from leads limit 1`;
      const leadId = leadRows[0].id;

      await sql`select upsert_application_outcome(${leadId}::uuid, 'applied'::application_status, null::text, now(), false)`;
      await sql`select upsert_application_outcome(${leadId}::uuid, 'replied'::application_status, 'founder replied'::text, now(), false)`;

      const rows = await sql<Array<{ applications: number; outcomes: number; status: string }>>`
        select (select count(*)::integer from applications where lead_id = ${leadId}::uuid) as applications,
               (select count(*)::integer from outcomes o join applications a on a.id = o.application_id where a.lead_id = ${leadId}::uuid) as outcomes,
               (select status::text from applications where lead_id = ${leadId}::uuid) as status
      `;
      assertEquals(rows[0].applications, 1);
      assertEquals(rows[0].outcomes, 2);
      assertEquals(rows[0].status, "replied");
    });
  } finally {
    await resetDatabase();
    await sql.end();
  }
});
