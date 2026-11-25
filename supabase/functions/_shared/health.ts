import { utcDayKey, utcDayOfMonth, utcHourKey } from "./time.ts";
import type { JobRow, JsonObject, LeadSource, SourceStateRow } from "./types.ts";
import type { Sql } from "./db.ts";

const FAILURE_THRESHOLDS: Record<LeadSource, number> = {
  hn: 3,
  github: 3,
  remotive: 2,
};

const QUIET_THRESHOLDS_HOURS: Record<LeadSource, number> = {
  hn: 12,
  github: 24,
  remotive: 72,
};

export async function enqueueOperationalJob(
  sql: Sql,
  type: JobRow["type"],
  idempotencyKey: string,
  payload: JsonObject,
  priority = 50,
  maxAttempts = 4,
): Promise<void> {
  await sql`
    insert into jobs (type, idempotency_key, payload, priority, max_attempts)
    values (
      ${type},
      ${idempotencyKey},
      ${sql.json(payload)},
      ${priority},
      ${maxAttempts}
    )
    on conflict (idempotency_key) do nothing
  `;
}

export async function maybeAlertSourceFailure(
  sql: Sql,
  source: LeadSource,
  errorMessage: string,
): Promise<void> {
  const rows = await sql<Array<{ consecutive_failures: number }>>`
    select consecutive_failures
    from source_states
    where source = ${source}::text::lead_source
  `;
  const failures = rows[0]?.consecutive_failures ?? 0;
  if (failures < FAILURE_THRESHOLDS[source]) return;

  await enqueueOperationalJob(
    sql,
    "discord_source_alert",
    `source-down:${source}:${utcHourKey()}`,
    {
      title: `${source} ingestion is failing`,
      source,
      message: `${source} has failed ${failures} consecutive fetch/persistence cycles. Latest error: ${errorMessage}`,
      consecutive_failures: failures,
    },
    90,
  );
}

export async function maybeAlertSourceRecovery(
  sql: Sql,
  source: LeadSource,
  priorFailures: number,
): Promise<void> {
  if (priorFailures < FAILURE_THRESHOLDS[source]) return;
  await enqueueOperationalJob(
    sql,
    "discord_source_alert",
    `source-recovered:${source}:${utcHourKey()}`,
    {
      title: `${source} ingestion recovered`,
      source,
      message: `${source} completed a successful ingestion cycle after ${priorFailures} consecutive failures.`,
    },
    60,
  );
}

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

export async function evaluateQuietAfterSuccess(
  sql: Sql,
  source: LeadSource,
  now = new Date(),
): Promise<void> {
  const stateRows = await sql<SourceStateRow[]>`
    select *
    from source_states
    where source = ${source}::text::lead_source
  `;
  const state = stateRows[0];
  if (!state) return;

  const leadRows = await sql<Array<{ last_lead_at: string | null; recent_count: number }>>`
    select max(first_seen_at) as last_lead_at,
           count(*) filter (where first_seen_at > now() - interval '14 days')::integer as recent_count
    from leads
    where source = ${source}::text::lead_source
  `;
  const lastLeadAt = leadRows[0]?.last_lead_at ?? null;
  const recentCount = Number(leadRows[0]?.recent_count ?? 0);
  const lastActivity = state.last_item_seen_at ?? lastLeadAt;
  const quietHours = hoursSince(lastActivity, now);
  const threshold = QUIET_THRESHOLDS_HOURS[source];
  let shouldAlert = false;
  let reason = "";

  if (source === "hn") {
    const threadId = state.cursor.thread_id;
    const threadPostedAt = typeof state.cursor.thread_posted_at === "string" ? state.cursor.thread_posted_at : null;
    const backfillComplete = state.cursor.backfill_complete === true;
    if (!threadId) {
      shouldAlert = utcDayOfMonth(now) > 3;
      reason = "the current monthly Who's Hiring thread was not discovered after the normal monthly posting window";
    } else if (!backfillComplete) {
      shouldAlert = false;
    } else {
      const threadAgeHours = hoursSince(threadPostedAt, now);
      const inMonthlyBurst = threadAgeHours !== null && threadAgeHours < 24 * 7;
      shouldAlert = inMonthlyBurst && quietHours !== null && quietHours > threshold;
      reason = `no new top-level comments for ${
        Math.floor(quietHours ?? 0)
      } hours during the first week of the monthly thread`;
    }
  } else {
    shouldAlert = recentCount > 0 && quietHours !== null && quietHours > threshold;
    reason = `no new leads for ${Math.floor(quietHours ?? 0)} hours; expected quiet threshold is ${threshold} hours`;
  }

  if (!shouldAlert) return;

  await enqueueOperationalJob(
    sql,
    "discord_source_alert",
    `source-quiet:${source}:${utcDayKey(now)}`,
    {
      title: `${source} looks quiet`,
      source,
      message:
        `${source} may be stale: ${reason}. This heuristic deliberately avoids alerting on ordinary between-month HN gaps.`,
      last_activity_at: lastActivity,
      recent_count_14d: recentCount,
    },
    40,
  );
}
