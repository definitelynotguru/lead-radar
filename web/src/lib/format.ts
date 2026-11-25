export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds))
    return "—";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function sourceLabel(source: string): string {
  if (source === "hn") return "HN Who's Hiring";
  if (source === "github") return "GitHub bounty";
  if (source === "remotive") return "Remotive";
  return source;
}

export function sourceAccent(source: string): string {
  if (source === "hn") return "bg-hn/15 text-hn ring-hn/30";
  if (source === "github") return "bg-github/15 text-github ring-github/30";
  if (source === "remotive")
    return "bg-remotive/15 text-remotive ring-remotive/30";
  return "bg-slate-500/15 text-slate-300 ring-slate-500/30";
}
