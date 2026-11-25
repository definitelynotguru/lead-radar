import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration, sourceLabel } from "../lib/format";
import type { DashboardSnapshot } from "../types";

const COLORS = {
  hn: "#ff8a3d",
  github: "#a78bfa",
  remotive: "#60a5fa",
};

type ChartRow = {
  day: string;
  hn: number;
  github: number;
  remotive: number;
};

function buildChartRows(
  rows: DashboardSnapshot["metrics"]["posts_by_source"],
): ChartRow[] {
  const byDay = new Map<string, ChartRow>();
  for (const row of rows) {
    const existing = byDay.get(row.day) ?? {
      day: row.day,
      hn: 0,
      github: 0,
      remotive: 0,
    };
    existing[row.source] = Number(row.count);
    byDay.set(row.day, existing);
  }
  return [...byDay.values()].sort((left, right) =>
    left.day.localeCompare(right.day),
  );
}

function tooltipStyle() {
  return {
    backgroundColor: "#111832",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: "14px",
    color: "#e2e8f0",
  };
}

export function MetricsSection({ snapshot }: { snapshot: DashboardSnapshot }) {
  const chartRows = useMemo(
    () => buildChartRows(snapshot.metrics.posts_by_source),
    [snapshot.metrics.posts_by_source],
  );
  const latency = snapshot.metrics.apply_latency;
  const replyRates = snapshot.metrics.reply_rates;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <article className="rounded-3xl border border-line bg-panel/75 p-5 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Posts per source
            </h2>
            <p className="mt-1 text-sm text-mist">
              Lead rows first seen or posted in the last 30 days.
            </p>
          </div>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
              barCategoryGap="22%"
            >
              <CartesianGrid
                stroke="rgba(148, 163, 184, 0.14)"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={(day: string) => day.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle()}
                cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
              <Bar
                dataKey="hn"
                name="HN"
                stackId="posts"
                fill={COLORS.hn}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="github"
                name="GitHub"
                stackId="posts"
                fill={COLORS.github}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="remotive"
                name="Remotive"
                stackId="posts"
                fill={COLORS.remotive}
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
        <article className="rounded-3xl border border-line bg-panel/75 p-5 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Time to apply</h2>
          <p className="mt-1 text-sm text-mist">
            Median and p90 from post timestamp to owner-applied outcome.
          </p>
          <div className="mt-4 space-y-3">
            {latency.length === 0 ? (
              <p className="text-sm text-mist">No applied outcomes yet.</p>
            ) : null}
            {latency.map((row) => (
              <div key={row.source} className="rounded-2xl bg-ink/45 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-white">
                    {sourceLabel(row.source)}
                  </span>
                  <span className="text-xs text-mist">n={row.sample_size}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-white/[0.04] p-2.5">
                    <div className="text-xs uppercase tracking-wide text-mist">
                      median
                    </div>
                    <div className="mt-1 font-semibold text-white">
                      {formatDuration(Number(row.median_seconds))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-2.5">
                    <div className="text-xs uppercase tracking-wide text-mist">
                      p90
                    </div>
                    <div className="mt-1 font-semibold text-white">
                      {formatDuration(Number(row.p90_seconds))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-line bg-panel/75 p-5 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">
            Reply rate by source
          </h2>
          <p className="mt-1 text-sm text-mist">
            Replies, interviews, and offers divided by non-ignored applications.
          </p>
          <div className="mt-5 space-y-4">
            {replyRates.map((row) => {
              const rate = Number(row.reply_rate_percent);
              return (
                <div key={row.source}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-white">
                      {sourceLabel(row.source)}
                    </span>
                    <span className="text-mist">
                      {row.replies}/{row.applications} · {rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, rate)}%`,
                        backgroundColor: COLORS[row.source],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
