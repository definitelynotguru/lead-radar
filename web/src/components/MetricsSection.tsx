import { useMemo, type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration, sourceLabel } from "../lib/format";
import type { DashboardSnapshot, LeadSource } from "../types";

const COLORS: Record<LeadSource, string> = {
  hn: "#e7a15f",
  github: "#b9a9e8",
  remotive: "#8fb8d8",
};
type ChartRow = { day: string; hn: number; github: number; remotive: number };

function rowsByDay(
  rows: DashboardSnapshot["metrics"]["posts_by_source"],
): ChartRow[] {
  const byDay = new Map<string, ChartRow>();
  for (const row of rows) {
    const item = byDay.get(row.day) ?? {
      day: row.day,
      hn: 0,
      github: 0,
      remotive: 0,
    };
    item[row.source] = Number(row.count);
    byDay.set(row.day, item);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function MetricsSection({ snapshot }: { snapshot: DashboardSnapshot }) {
  const chartRows = useMemo(
    () => rowsByDay(snapshot.metrics.posts_by_source),
    [snapshot.metrics.posts_by_source],
  );
  const latency = snapshot.metrics.apply_latency;
  const replies = snapshot.metrics.reply_rates;
  return (
    <section className="panel metrics-panel" id="metrics">
      <div className="section-heading-row">
        <div>
          <div className="eyebrow">Evidence</div>
          <h2>Source metrics</h2>
          <p className="section-copy">
            Post volume, time to apply, and reply rate without hiding sample
            size.
          </p>
        </div>
      </div>
      <div className="workspace-grid metrics-layout">
        <div className="chart-box">
          {chartRows.length === 0 ? (
            <div className="chart-empty">
              <h3>No post volume yet</h3>
              <p>Source counts appear after the first persisted fetch run.</p>
            </div>
          ) : null}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              margin={{ top: 8, right: 8, bottom: 0, left: -22 }}
              barCategoryGap="28%"
            >
              <CartesianGrid stroke="rgba(227,226,218,.09)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "#a4aaa2", fontSize: 11 }}
                tickFormatter={(day: string) => day.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#a4aaa2", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#1f2725",
                  border: "1px solid rgba(227,226,218,.14)",
                  borderRadius: 14,
                  color: "#e3e2da",
                }}
                cursor={{ fill: "rgba(227,226,218,.06)" }}
              />
              <Bar dataKey="hn" name="HN" stackId="posts" fill={COLORS.hn} />
              <Bar
                dataKey="github"
                name="GitHub"
                stackId="posts"
                fill={COLORS.github}
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
        <div className="side-stack">
          <div>
            <h3>Time to apply</h3>
            {latency.length === 0 ? (
              <p className="section-copy">No applied outcomes yet.</p>
            ) : (
              latency.map((row) => (
                <div
                  className="latency-grid"
                  key={row.source}
                  style={
                    { "--source-color": COLORS[row.source] } as CSSProperties
                  }
                >
                  <div className="latency-cell">
                    <small>{sourceLabel(row.source)} median</small>
                    <strong>
                      {formatDuration(Number(row.median_seconds))}
                    </strong>
                  </div>
                  <div className="latency-cell">
                    <small>p90 · n={row.sample_size}</small>
                    <strong>{formatDuration(Number(row.p90_seconds))}</strong>
                  </div>
                </div>
              ))
            )}
          </div>
          <div>
            <h3>Reply rate</h3>
            <div className="metric-list">
              {replies.length === 0 ? (
                <p className="section-copy">No applications recorded yet.</p>
              ) : null}
              {replies.map((row) => {
                const rate = Number(row.reply_rate_percent);
                return (
                  <div
                    className="metric-row"
                    key={row.source}
                    style={
                      { "--source-color": COLORS[row.source] } as CSSProperties
                    }
                  >
                    <header>
                      <span>{sourceLabel(row.source)}</span>
                      <span>
                        {row.replies}/{row.applications} · {rate.toFixed(1)}%
                      </span>
                    </header>
                    <div className="meter">
                      <span style={{ width: `${Math.min(100, rate)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
