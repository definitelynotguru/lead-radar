import { Radar, RefreshCw } from "lucide-react";

interface HeaderProps {
  demoMode: boolean;
  loading: boolean;
  generatedAt?: string;
  onRefresh: () => void;
}

export function Header({
  demoMode,
  loading,
  generatedAt,
  onRefresh,
}: HeaderProps) {
  return (
    <header className="flex flex-col gap-5 rounded-3xl border border-line bg-panel/80 p-6 shadow-glow backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 via-sky-400 to-violet-500 text-ink">
          <Radar size={26} strokeWidth={2.4} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              lead-radar
            </h1>
            {demoMode ? (
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs font-medium text-amber-200">
                demo data
              </span>
            ) : (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
                live snapshot
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-mist">
            Zero-cost monitoring for HN Who&apos;s Hiring, GitHub bounty issues,
            and Remotive.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm text-mist">
        <span className="hidden md:inline">
          Snapshot{" "}
          {generatedAt ? new Date(generatedAt).toLocaleTimeString() : "—"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-white/5 px-3 py-2 font-medium text-slate-100 transition hover:bg-white/10"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
    </header>
  );
}
