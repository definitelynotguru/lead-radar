import type { CSSProperties } from "react";
import { sourceLabel, timeAgo } from "../lib/format";
import type { LeadSource, SourceHealthRow } from "../types";

const COLORS: Record<LeadSource, string> = {
  hn: "var(--hn)",
  github: "var(--github)",
  remotive: "var(--remotive)",
};

function cadence(seconds: number): string {
  return seconds < 3600
    ? `${Math.round(seconds / 60)}m cadence`
    : `${(seconds / 3600).toFixed(0)}h cadence`;
}

export function SourceHealthStrip({ rows }: { rows: SourceHealthRow[] }) {
  return (
    <section className="panel rail-panel" id="sources">
      <div className="eyebrow">Sources</div>
      <h2>Fetch health</h2>
      {rows.map((row) => {
        const state = !row.enabled
          ? "disabled"
          : row.consecutive_failures
            ? "failing"
            : row.last_success_at
              ? "healthy"
              : "waiting";
        return (
          <article
            className="source-row"
            key={row.source}
            style={{ "--source-color": COLORS[row.source] } as CSSProperties}
          >
            <div>
              <div className="source-name">
                <span className="source-dot" />
                {sourceLabel(row.source)}
              </div>
              <div className="source-meta">
                {cadence(row.cadence_seconds)} · {state} ·{" "}
                {row.last_success_at
                  ? `success ${timeAgo(row.last_success_at)}`
                  : "no success yet"}
              </div>
              {row.last_error ? (
                <div className="health-error">{row.last_error}</div>
              ) : null}
            </div>
            <div className="source-count">
              <strong>{row.leads_last_24h}</strong>
              <small>leads / 24h</small>
            </div>
          </article>
        );
      })}
    </section>
  );
}
