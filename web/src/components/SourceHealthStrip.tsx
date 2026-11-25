import { Activity, AlertTriangle, Clock3 } from "lucide-react";
import type { SourceHealthRow } from "../types";
import { sourceLabel, timeAgo } from "../lib/format";

function healthState(row: SourceHealthRow): {
  label: string;
  className: string;
} {
  if (!row.enabled)
    return {
      label: "disabled",
      className: "border-slate-400/30 bg-slate-400/10 text-slate-300",
    };
  if (row.consecutive_failures > 0) {
    return {
      label: "failing",
      className: "border-red-400/30 bg-red-400/10 text-red-200",
    };
  }
  if (!row.last_success_at)
    return {
      label: "waiting",
      className: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    };
  return {
    label: "healthy",
    className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  };
}

function cadenceLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m cadence`;
  return `${(seconds / 3600).toFixed(seconds % 3600 === 0 ? 0 : 1)}h cadence`;
}

export function SourceHealthStrip({ rows }: { rows: SourceHealthRow[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {rows.map((row) => {
        const state = healthState(row);
        return (
          <article
            key={row.source}
            className="rounded-3xl border border-line bg-panel/75 p-5 backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">
                  {sourceLabel(row.source)}
                </h2>
                <p className="mt-1 text-xs text-mist">
                  {cadenceLabel(row.cadence_seconds)}
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${state.className}`}
              >
                {state.label}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-mist">
                  <Activity size={13} /> leads/24h
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {row.leads_last_24h}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-mist">
                  <Clock3 size={13} /> success
                </div>
                <div className="mt-1 text-sm font-medium text-slate-100">
                  {timeAgo(row.last_success_at)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-mist">
                  <AlertTriangle size={13} /> failures
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {row.consecutive_failures}
                </div>
              </div>
            </div>
            {row.last_error ? (
              <p className="mt-4 rounded-xl bg-red-400/10 p-3 text-xs text-red-100">
                {row.last_error}
              </p>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
