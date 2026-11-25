import { executeDiscordJob } from "./discord.ts";
import { nextRetryAt } from "./queue.ts";
import type { JobRow } from "./types.ts";
import type { Sql } from "./db.ts";

export interface JobProcessingSummary {
  expiredClaimsMarkedAmbiguous: number;
  claimed: number;
  succeeded: number;
  retryScheduled: number;
  ambiguous: number;
  deadLettered: number;
  completionErrors: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "unknown job execution error";
}

export async function processDueJobs(
  sql: Sql,
  workerId: string,
  discordWebhookUrl: string | undefined,
  limit = 12,
): Promise<JobProcessingSummary> {
  const expiredRows = await sql<Array<{ mark_expired_claims_ambiguous: number }>>`
    select mark_expired_claims_ambiguous()
  `;
  const expiredClaimsMarkedAmbiguous = Number(expiredRows[0]?.mark_expired_claims_ambiguous ?? 0);

  const jobs = await sql<JobRow[]>`
    select *
    from claim_due_jobs(${workerId}, ${limit}, 120)
  `;

  const summary: JobProcessingSummary = {
    expiredClaimsMarkedAmbiguous,
    claimed: jobs.length,
    succeeded: 0,
    retryScheduled: 0,
    ambiguous: 0,
    deadLettered: 0,
    completionErrors: 0,
  };

  for (const job of jobs) {
    const started = performance.now();
    let outcome: "success" | "retryable_failure" | "permanent_failure" | "ambiguous";
    let error: string | null = null;
    let responseStatus: number | null = null;
    let retryAfterSeconds: number | undefined;

    try {
      const result = await executeDiscordJob(job, discordWebhookUrl);
      outcome = result.outcome;
      error = result.error ?? null;
      responseStatus = result.responseStatus ?? null;
      retryAfterSeconds = result.retryAfterSeconds;
    } catch (executionError) {
      outcome = "retryable_failure";
      error = errorMessage(executionError);
    }

    const durationMs = Math.max(0, Math.round(performance.now() - started));
    const nextRun = outcome === "retryable_failure"
      ? nextRetryAt(job.attempts, job.idempotency_key, retryAfterSeconds)
      : null;

    try {
      await sql`
        select complete_job(
          ${job.id}::uuid,
          ${workerId},
          ${outcome},
          ${error}::text,
          ${responseStatus}::integer,
          ${durationMs}::integer,
          ${nextRun}::timestamptz
        )
      `;
    } catch (completionError) {
      summary.completionErrors += 1;
      console.error(`complete_job failed for ${job.id}: ${errorMessage(completionError)}`);
      continue;
    }

    if (outcome === "success") summary.succeeded += 1;
    if (outcome === "retryable_failure") {
      if (job.attempts >= job.max_attempts) summary.deadLettered += 1;
      else summary.retryScheduled += 1;
    }
    if (outcome === "permanent_failure") summary.deadLettered += 1;
    if (outcome === "ambiguous") summary.ambiguous += 1;
  }

  return summary;
}
