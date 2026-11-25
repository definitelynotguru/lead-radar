import { hasValidBearerToken } from "../_shared/auth.ts";
import { createDatabase, readRuntimeEnv, type Sql } from "../_shared/db.ts";
import { corsHeaders, corsJsonResponse } from "../_shared/http.ts";
import { serveEntrypoint } from "../_shared/serve.ts";

const APPLICATION_STATUSES = new Set(["applied", "ignored", "replied", "rejected", "interview", "offer", "closed"]);

type Row = Record<string, unknown>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRaisedBusinessRule(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P0001";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 800) : "unknown dashboard-api error";
}

async function snapshot(sql: Sql): Promise<Row> {
  const leads = await sql<Row[]>`
    select l.id,
           l.source,
           l.external_id,
           l.canonical_url,
           l.title,
           l.company,
           l.location,
           l.salary,
           left(l.description, 4000) as description,
           l.tags,
           l.remote,
           l.posted_at,
           l.first_seen_at,
           a.status as application_status,
           a.applied_at,
           a.owner_notes,
           a.is_demo as application_is_demo
    from leads l
    left join applications a on a.lead_id = l.id
    order by l.first_seen_at desc
    limit 120
  `;

  const postsBySource = await sql<Row[]>`
    select source::text as source,
           to_char(date_trunc('day', coalesce(posted_at, first_seen_at)) at time zone 'utc', 'YYYY-MM-DD') as day,
           count(*)::integer as count
    from leads
    where coalesce(posted_at, first_seen_at) > now() - interval '30 days'
    group by source, day
    order by day asc, source asc
  `;

  const latency = await sql<Row[]>`
    with latency as (
      select l.source::text as source,
             extract(epoch from (a.applied_at - coalesce(l.posted_at, l.first_seen_at)))::double precision as latency_seconds
      from applications a
      join leads l on l.id = a.lead_id
      where a.applied_at is not null
    )
    select source,
           count(*)::integer as sample_size,
           (percentile_cont(0.5) within group (order by latency_seconds))::double precision as median_seconds,
           (percentile_cont(0.9) within group (order by latency_seconds))::double precision as p90_seconds
    from latency
    where latency_seconds >= 0
    group by source
    order by source
  `;

  const replyRates = await sql<Row[]>`
    select l.source::text as source,
           count(a.id) filter (where a.status <> 'ignored')::integer as applications,
           count(a.id) filter (
             where a.status <> 'ignored'
               and exists (
                 select 1
                 from outcomes o
                 where o.application_id = a.id
                   and o.kind in ('replied', 'interview', 'offer')
               )
           )::integer as replies,
           case
             when count(a.id) filter (where a.status <> 'ignored') = 0 then 0
             else round(
               (count(a.id) filter (
                 where a.status <> 'ignored'
                   and exists (
                     select 1
                     from outcomes o
                     where o.application_id = a.id
                       and o.kind in ('replied', 'interview', 'offer')
                   )
               )::numeric /
                count(a.id) filter (where a.status <> 'ignored')::numeric) * 100,
               1
             )
           end as reply_rate_percent
    from leads l
    left join applications a on a.lead_id = l.id
    group by l.source
    order by l.source
  `;

  const sourceHealth = await sql<Row[]>`
    select s.source::text,
           s.enabled,
           s.cadence_seconds,
           s.cursor,
           s.last_run_at,
           s.last_success_at,
           s.last_error_at,
           s.last_item_seen_at,
           s.consecutive_failures,
           s.last_error,
           count(l.id) filter (where l.first_seen_at > now() - interval '24 hours')::integer as leads_last_24h,
           count(l.id)::integer as total_leads
    from source_states s
    left join leads l on l.source = s.source
    group by s.source, s.enabled, s.cadence_seconds, s.cursor, s.last_run_at, s.last_success_at, s.last_error_at,
             s.last_item_seen_at, s.consecutive_failures, s.last_error
    order by s.source
  `;

  const queueCounts = await sql<Row[]>`
    select status::text as status, count(*)::integer as count
    from jobs
    group by status
    order by status
  `;

  const problemJobs = await sql<Row[]>`
    select j.id,
           j.type,
           j.idempotency_key,
           jsonb_build_object(
             'title', j.payload->>'title',
             'source', j.payload->>'source',
             'external_id', j.payload->>'external_id'
           ) as payload,
           j.status,
           j.attempts,
           j.max_attempts,
           j.run_at,
           j.last_error,
           j.last_response_status,
           j.updated_at,
           coalesce(recent_attempts.attempts, '[]'::jsonb) as recent_attempts
    from jobs j
    left join lateral (
      select jsonb_agg(row_to_json(attempt_rows)) as attempts
      from (
        select attempt_number, status, error, response_status, duration_ms, started_at, finished_at
        from job_attempts
        where job_id = j.id
        order by started_at desc
        limit 5
      ) as attempt_rows
    ) as recent_attempts on true
    where j.status in ('failed', 'ambiguous', 'dead_lettered')
       or j.last_error is not null
    order by j.updated_at desc
    limit 25
  `;

  const recentFetchRuns = await sql<Row[]>`
    select id, source::text as source, started_at, finished_at, status, http_status, item_count, new_lead_count,
           duration_ms, error_message, details
    from fetch_runs
    order by started_at desc
    limit 30
  `;

  const deadLetters = await sql<Row[]>`
    select id, job_id, type, idempotency_key, attempts, reason, last_response_status, dead_at
    from dead_letters
    order by dead_at desc
    limit 20
  `;

  return {
    generated_at: new Date().toISOString(),
    leads,
    metrics: {
      posts_by_source: postsBySource,
      apply_latency: latency,
      reply_rates: replyRates,
    },
    source_health: sourceHealth,
    queue: {
      counts: queueCounts,
      problem_jobs: problemJobs,
      recent_fetch_runs: recentFetchRuns,
      dead_letters: deadLetters,
    },
    meta: {
      demo_mode: false,
      snapshot_limit: 120,
    },
  };
}

async function recordAction(sql: Sql, request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { lead_id?: string; status?: string; notes?: string } | null;
  if (!body?.lead_id || !body.status || !APPLICATION_STATUSES.has(body.status)) {
    return corsJsonResponse({ error: "lead_id and a valid status are required" }, 400);
  }
  if (!isUuid(body.lead_id)) return corsJsonResponse({ error: "lead_id must be a UUID" }, 400);

  const rows = await sql<Row[]>`
    select upsert_application_outcome(
      ${body.lead_id}::uuid,
      ${body.status}::text::application_status,
      ${body.notes ?? null}::text,
      now(),
      false
    ) as result
  `;
  return corsJsonResponse({ ok: true, result: rows[0]?.result ?? null });
}

async function requeueJob(sql: Sql, request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { job_id?: string; reset_attempts?: boolean } | null;
  if (!body?.job_id) return corsJsonResponse({ error: "job_id is required" }, 400);
  if (!isUuid(body.job_id)) return corsJsonResponse({ error: "job_id must be a UUID" }, 400);

  try {
    const rows = await sql<Row[]>`
      select row_to_json(job) as job
      from requeue_job(${body.job_id}::uuid, 0, ${body.reset_attempts !== false}) as job
    `;
    return corsJsonResponse({ ok: true, job: rows[0]?.job ?? null });
  } catch (error) {
    if (isRaisedBusinessRule(error)) return corsJsonResponse({ error: errorMessage(error) }, 409);
    throw error;
  }
}

async function acknowledgeJob(sql: Sql, request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { job_id?: string } | null;
  if (!body?.job_id) return corsJsonResponse({ error: "job_id is required" }, 400);
  if (!isUuid(body.job_id)) return corsJsonResponse({ error: "job_id must be a UUID" }, 400);

  try {
    const rows = await sql<Row[]>`
      select row_to_json(job) as job
      from acknowledge_ambiguous_job(${body.job_id}::uuid) as job
    `;
    return corsJsonResponse({ ok: true, job: rows[0]?.job ?? null });
  } catch (error) {
    if (isRaisedBusinessRule(error)) return corsJsonResponse({ error: errorMessage(error) }, 409);
    throw error;
  }
}

serveEntrypoint(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/health")) {
    return corsJsonResponse({ ok: true, service: "lead-radar-dashboard-api" });
  }

  const env = readRuntimeEnv();
  if (!hasValidBearerToken(request, env.dashboardAccessToken)) {
    return corsJsonResponse({ error: "unauthorized" }, 401);
  }
  if (!env.databaseUrl) return corsJsonResponse({ error: "LEAD_RADAR_DATABASE_URL is not configured" }, 500);

  const sql = createDatabase(env.databaseUrl);
  try {
    if (request.method === "GET" && (url.pathname.endsWith("/snapshot") || url.pathname.endsWith("/dashboard-api"))) {
      return corsJsonResponse(await snapshot(sql));
    }
    if (request.method === "POST" && url.pathname.endsWith("/action")) {
      return await recordAction(sql, request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/jobs/requeue")) {
      return await requeueJob(sql, request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/jobs/acknowledge")) {
      return await acknowledgeJob(sql, request);
    }
    return corsJsonResponse({ error: "not found" }, 404);
  } catch (error) {
    return corsJsonResponse({ error: errorMessage(error) }, 500);
  } finally {
    await sql.end();
  }
});
