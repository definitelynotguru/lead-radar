import { AlertOctagon, CheckCircle2, RotateCcw } from "lucide-react";
import { timeAgo } from "../lib/format";
import type { DashboardSnapshot, JobStatus } from "../types";

const STATUS_ORDER: JobStatus[] = [
  "pending",
  "claimed",
  "failed",
  "ambiguous",
  "dead_lettered",
  "succeeded",
];

function countFor(
  rows: DashboardSnapshot["queue"]["counts"],
  status: JobStatus,
): number {
  return Number(rows.find((row) => row.status === status)?.count ?? 0);
}

function statusTone(status: JobStatus): string {
  if (status === "dead_lettered" || status === "failed") return "text-red-200";
  if (status === "ambiguous") return "text-amber-200";
  if (status === "succeeded") return "text-emerald-200";
  return "text-slate-100";
}

interface QueueStripProps {
  queue: DashboardSnapshot["queue"];
  liveMode: boolean;
  busyJobId: string | null;
  onRequeue: (jobId: string) => void;
  onAcknowledge: (jobId: string) => void;
}

export function QueueStrip({
  queue,
  liveMode,
  busyJobId,
  onRequeue,
  onAcknowledge,
}: QueueStripProps) {
  return (
    <section className="rounded-3xl border border-line bg-panel/75 p-5 backdrop-blur">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Queue health</h2>
          <p className="mt-1 text-sm text-mist">
            Durable Postgres jobs with bounded retries, crash ambiguity, dead
            letters, and error history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="rounded-xl border border-line bg-ink/45 px-3 py-2 text-center"
            >
              <div className={`text-lg font-semibold ${statusTone(status)}`}>
                {countFor(queue.counts, status)}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-mist">
                {status.replace("_", " ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-mist">
            Inspectable failures
          </h3>
          <div className="mt-3 space-y-3">
            {queue.problem_jobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-mist">
                No failed, ambiguous, or dead-lettered jobs.
              </div>
            ) : (
              queue.problem_jobs.slice(0, 4).map((job) => (
                <article
                  key={job.id}
                  className="rounded-2xl border border-line bg-ink/45 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertOctagon
                          size={15}
                          className={
                            job.status === "ambiguous"
                              ? "text-amber-200"
                              : "text-red-200"
                          }
                        />
                        <span className="font-medium text-white">
                          {String(job.payload.title ?? job.type)}
                        </span>
                        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-mist">
                          {job.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-red-100/90">
                        {job.last_error ?? "No error message recorded"}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {job.idempotency_key}
                      </p>
                    </div>
                    {liveMode ? (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {job.status === "ambiguous" ? (
                          <button
                            type="button"
                            onClick={() => onAcknowledge(job.id)}
                            disabled={busyJobId === job.id}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/20 disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            Mark delivered
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onRequeue(job.id)}
                          disabled={busyJobId === job.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/30 bg-emerald-200/10 px-3 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-200/20 disabled:opacity-50"
                        >
                          <RotateCcw
                            size={14}
                            className={
                              busyJobId === job.id ? "animate-spin" : ""
                            }
                          />
                          Requeue
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <details className="mt-3 text-xs text-mist">
                    <summary className="cursor-pointer select-none text-slate-300">
                      Attempt history
                    </summary>
                    <div className="mt-2 space-y-2">
                      {job.recent_attempts.map((attempt) => (
                        <div
                          key={attempt.attempt_number}
                          className="rounded-xl bg-white/[0.04] p-2.5"
                        >
                          attempt {attempt.attempt_number}: {attempt.status}
                          {attempt.response_status
                            ? ` · HTTP ${attempt.response_status}`
                            : ""}
                          {attempt.duration_ms !== null
                            ? ` · ${attempt.duration_ms}ms`
                            : ""}
                          {attempt.error ? (
                            <div className="mt-1 text-red-100/80">
                              {attempt.error}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-mist">
            Recent fetch runs
          </h3>
          <div className="mt-3 space-y-2">
            {queue.recent_fetch_runs.slice(0, 6).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-xl bg-ink/45 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium capitalize text-white">
                    {run.source}
                  </span>
                  <span className="ml-2 text-mist">
                    {timeAgo(run.started_at)}
                  </span>
                </div>
                <div className="text-right text-xs text-mist">
                  <div
                    className={
                      run.status === "error"
                        ? "text-red-200"
                        : "text-emerald-200"
                    }
                  >
                    {run.status ?? "running"}
                  </div>
                  <div>
                    {run.new_lead_count}/{run.item_count} new
                  </div>
                </div>
              </div>
            ))}
          </div>
          {queue.dead_letters.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">
              {queue.dead_letters.length} dead-lettered job(s) retained in the
              separate dead-letter queue.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
