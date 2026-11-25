import { KeyRound, Link2, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface ConnectPanelProps {
  initialApiUrl: string;
  initialToken: string;
  connected: boolean;
  error: string | null;
  onSave: (apiUrl: string, token: string) => void;
  onUseDemo: () => void;
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

  return (
    <section className="rounded-3xl border border-line bg-panel/75 p-5 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <ShieldCheck size={19} className="text-emerald-200" /> Live data
            connection
          </h2>
          <p className="mt-1 text-sm leading-6 text-mist">
            The static dashboard never ships the service-role key or database
            URL. Paste the deployed dashboard-api URL and your owner access
            token; they stay in this browser&apos;s local storage.
          </p>
          {error ? (
            <p className="mt-2 rounded-xl border border-red-300/25 bg-red-300/10 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}
        </div>
        <div className="grid w-full gap-2 lg:max-w-2xl lg:grid-cols-[1fr_0.8fr_auto_auto]">
          <label className="relative">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist"
              size={15}
            />
            <input
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
              placeholder="https://project.supabase.co/functions/v1/dashboard-api"
              className="w-full rounded-xl border border-line bg-ink/70 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50"
            />
          </label>
          <label className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist"
              size={15}
            />
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type="password"
              placeholder="owner access token"
              className="w-full rounded-xl border border-line bg-ink/70 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50"
            />
          </label>
          <button
            type="button"
            onClick={() => onSave(apiUrl, token)}
            className="rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-sky-200"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={onUseDemo}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Demo
          </button>
        </div>
      </div>
      {!connected ? (
        <p className="mt-3 text-xs text-mist">
          Demo mode is explicit: lead outcomes shown here are seeded examples,
          not real application history.
        </p>
      ) : null}
    </section>
  );
}
