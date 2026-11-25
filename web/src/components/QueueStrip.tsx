import { timeAgo } from "../lib/format";
import type { DashboardSnapshot, JobStatus } from "../types";

const ORDER: JobStatus[] = [
  "pending",
  "claimed",
  "failed",
  "ambiguous",
  "dead_lettered",
  "succeeded",
];
function count(rows: DashboardSnapshot["queue"]["counts"], status: JobStatus) {
  return Number(rows.find((row) => row.status === status)?.count ?? 0);
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
    <section className="panel queue-panel" id="operations">
      <div className="section-head">
        <div className="eyebrow">Operations</div>
        <h2>Queue health</h2>
        <p className="section-copy">
          Durable Postgres jobs with retries, crash ambiguity, dead letters, and
          owner-controlled recovery.
        </p>
        <div className="queue-counts">
          {ORDER.map((status) => (
            <span className="queue-count" key={status}>
              <strong>{count(queue.counts, status)}</strong>
              {status.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>
      <div className="workspace-grid queue-body">
        <div>
          <h3>Inspectable failures</h3>
          <div className="job-list">
            {queue.problem_jobs.length === 0 ? (
              <div className="empty-state">
                <h3>No broken work</h3>
                <p>No failed, ambiguous, or dead-lettered jobs.</p>
              </div>
            ) : (
              queue.problem_jobs.slice(0, 5).map((job) => (
                <article className="job-card" key={job.id}>
                  <div className="job-title">
                    <span>{String(job.payload.title ?? job.type)}</span>
                    <span className="pill">{job.status}</span>
                  </div>
                  <p className="job-error">
                    {job.last_error ?? "No error message recorded"}
                  </p>
                  <div className="job-key">{job.idempotency_key}</div>
                  {liveMode ? (
                    <div className="job-actions">
                      {job.status === "ambiguous" ? (
                        <button
                          className="button ghost"
                          type="button"
                          disabled={busyJobId === job.id}
                          onClick={() => onAcknowledge(job.id)}
                        >
                          Mark delivered
                        </button>
                      ) : null}
                      <button
                        className="button ghost danger"
                        type="button"
                        disabled={busyJobId === job.id}
                        onClick={() => onRequeue(job.id)}
                      >
                        Requeue
                      </button>
                    </div>
                  ) : null}
                  <details>
                    <summary className="details-toggle">
                      Attempt history
                    </summary>
                    {job.recent_attempts.map((attempt) => (
                      <div className="job-key" key={attempt.attempt_number}>
                        attempt {attempt.attempt_number}: {attempt.status}
                        {attempt.response_status
                          ? ` · HTTP ${attempt.response_status}`
                          : ""}
                        {attempt.duration_ms !== null
                          ? ` · ${attempt.duration_ms}ms`
                          : ""}
                      </div>
                    ))}
                  </details>
                </article>
              ))
            )}
          </div>
        </div>
        <div>
          <h3>Recent fetch runs</h3>
          <div className="fetch-list">
            {queue.recent_fetch_runs.slice(0, 7).map((run) => (
              <div className="fetch-row" key={run.id}>
                <span>
                  <strong>{run.source}</strong> · {timeAgo(run.started_at)}
                </span>
                <span>
                  {run.status ?? "running"} · {run.new_lead_count}/
                  {run.item_count} new
                </span>
              </div>
            ))}
          </div>
          {queue.dead_letters.length ? (
            <div className="health-error">
              {queue.dead_letters.length} dead-lettered job(s) retained for
              inspection.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
