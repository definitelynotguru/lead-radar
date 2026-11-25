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
    <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-panel/80 shadow-glow backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(255,138,61,0.2),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(96,165,250,0.22),transparent_34%)]" />
      <div className="relative flex flex-col gap-8 p-6 md:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-300 via-sky-300 to-violet-400 text-ink shadow-lg shadow-sky-950/40">
              <Radar size={23} strokeWidth={2.5} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">
              zero-cost reliability demo
            </span>
            {demoMode ? (
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
                demo data
              </span>
            ) : (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
                live snapshot
              </span>
            )}
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.045em] text-white md:text-5xl">
            Lead Radar
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
            HN Who&apos;s Hiring, GitHub bounty issues, and Remotive in one
            owner-controlled inbox, with the queue semantics visible instead of
            hidden.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end">
          <div className="text-sm text-slate-400">
            Snapshot{" "}
            <span className="font-medium text-slate-100">
              {generatedAt ? new Date(generatedAt).toLocaleTimeString() : "—"}
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.07] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.12] focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}
