import { KeyRound, Link2, PencilLine, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface ConnectPanelProps {
  initialApiUrl: string;
  initialToken: string;
  connected: boolean;
  error: string | null;
  onSave: (apiUrl: string, token: string) => void;
  onUseDemo: () => void;
}

function compactUrl(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function ConnectPanel({
  initialApiUrl,
  initialToken,
  connected,
  error,
  onSave,
  onUseDemo,
}: ConnectPanelProps) {
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [token, setToken] = useState(initialToken);
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.045] px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-300/10 text-emerald-200">
              <ShieldCheck size={17} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                {connected
                  ? "Live data connected"
                  : "Exploring explicit demo data"}
              </div>
              <div className="truncate text-xs text-slate-400">
                {connected
                  ? compactUrl(initialApiUrl)
                  : "Connect a deployed dashboard-api when you are ready"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
          >
            <PencilLine size={14} />
            {connected ? "Change connection" : "Connect live data"}
          </button>
        </div>
        {error ? (
          <p className="mt-3 rounded-2xl border border-red-300/25 bg-red-300/10 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-panel/75 backdrop-blur">
      <div className="grid gap-6 p-5 md:p-6 xl:grid-cols-[0.9fr_1.4fr] xl:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">
            <ShieldCheck size={14} /> owner access
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Connect the live snapshot.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            The static dashboard never ships the service-role key or database
            URL. Paste the deployed dashboard-api URL and owner token; they stay
            in this browser&apos;s local storage.
          </p>
          {error ? (
            <p className="mt-4 rounded-2xl border border-red-300/25 bg-red-300/10 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              dashboard api
            </span>
            <span className="relative block">
              <Link2
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                size={15}
              />
              <input
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder="https://project.supabase.co/functions/v1/dashboard-api"
                className="w-full rounded-2xl border border-white/10 bg-ink/70 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/20"
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              owner token
            </span>
            <span className="relative block">
              <KeyRound
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                size={15}
              />
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                type="password"
                placeholder="owner access token"
                className="w-full rounded-2xl border border-white/10 bg-ink/70 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/20"
              />
            </span>
          </label>
          <div className="flex flex-wrap gap-2 lg:col-span-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onSave(apiUrl, token);
              }}
              className="rounded-full bg-sky-300 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-100/70"
            >
              Connect live data
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onUseDemo();
              }}
              className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
            >
              Explore demo data
            </button>
          </div>
        </div>
      </div>
      {!connected ? (
        <div className="border-t border-white/10 bg-white/[0.03] px-5 py-3 text-xs leading-5 text-slate-400 md:px-6">
          Demo mode is explicit. Seeded outcomes are marked demo data and are
          not real application history.
        </div>
      ) : null}
    </section>
  );
}
