import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConnectPanel } from "./components/ConnectPanel";
import { Header } from "./components/Header";
import { LeadInbox } from "./components/LeadInbox";
import { QueueStrip } from "./components/QueueStrip";
import { SourceHealthStrip } from "./components/SourceHealthStrip";
import { buildDemoSnapshot } from "./demoData";
import { fetchSnapshot, postLeadAction, requeueProblemJob } from "./lib/api";
import type { ApplicationStatus, DashboardSnapshot, LeadRow } from "./types";

const API_STORAGE_KEY = "lead-radar:dashboard-api-url";
const TOKEN_STORAGE_KEY = "lead-radar:dashboard-token";

const MetricsSection = lazy(() =>
  import("./components/MetricsSection").then((module) => ({
    default: module.MetricsSection,
  })),
);

function readInitialConfig() {
  return {
    apiUrl:
      localStorage.getItem(API_STORAGE_KEY) ??
      (import.meta.env.VITE_DASHBOARD_API_URL as string | undefined) ??
      "",
    token: localStorage.getItem(TOKEN_STORAGE_KEY) ?? "",
  };
}

function demoAction(
  snapshot: DashboardSnapshot,
  lead: LeadRow,
  status: ApplicationStatus,
): DashboardSnapshot {
  return {
    ...snapshot,
    leads: snapshot.leads.map((row) =>
      row.id === lead.id
        ? {
            ...row,
            application_status: status,
            application_is_demo: true,
            owner_notes: `Demo action: marked ${status}`,
            applied_at:
              status === "applied"
                ? (row.applied_at ?? new Date().toISOString())
                : row.applied_at,
          }
        : row,
    ),
  };
}

export default function App() {
  const [config, setConfig] = useState(readInitialConfig);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(() =>
    buildDemoSnapshot(),
  );
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const liveConfigured = Boolean(config.apiUrl.trim() && config.token.trim());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!liveConfigured) {
        setSnapshot(buildDemoSnapshot());
        setDemoMode(true);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const live = await fetchSnapshot(config.apiUrl, config.token);
        if (cancelled) return;
        setSnapshot(live);
        setDemoMode(false);
        setError(null);
      } catch (fetchError) {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? `Live connection failed: ${fetchError.message}. Showing explicit demo data.`
            : "Live connection failed. Showing explicit demo data.",
        );
        setSnapshot((current) =>
          current.meta.demo_mode ? buildDemoSnapshot() : current,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [config.apiUrl, config.token, liveConfigured, refreshIndex]);

  const saveConnection = useCallback((apiUrl: string, token: string) => {
    localStorage.setItem(API_STORAGE_KEY, apiUrl.trim());
    localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    setConfig({ apiUrl: apiUrl.trim(), token: token.trim() });
  }, []);

  const useDemo = useCallback(() => {
    localStorage.removeItem(API_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setConfig({ apiUrl: "", token: "" });
    setSnapshot(buildDemoSnapshot());
    setDemoMode(true);
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    if (!liveConfigured) {
      setSnapshot(buildDemoSnapshot());
      setDemoMode(true);
      return;
    }
    setRefreshIndex((value) => value + 1);
  }, [liveConfigured]);

  const handleLeadAction = useCallback(
    async (lead: LeadRow, status: ApplicationStatus) => {
      if (demoMode || !liveConfigured) {
        setSnapshot((current) => demoAction(current, lead, status));
        return;
      }

      setBusyLeadId(lead.id);
      try {
        await postLeadAction(config.apiUrl, config.token, lead.id, status);
        setSnapshot((current) => ({
          ...current,
          leads: current.leads.map((row) =>
            row.id === lead.id
              ? {
                  ...row,
                  application_status: status,
                  application_is_demo: false,
                  applied_at:
                    status === "applied"
                      ? (row.applied_at ?? new Date().toISOString())
                      : row.applied_at,
                }
              : row,
          ),
        }));
        setRefreshIndex((value) => value + 1);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? `Could not save outcome: ${actionError.message}`
            : "Could not save outcome.",
        );
      } finally {
        setBusyLeadId(null);
      }
    },
    [config.apiUrl, config.token, demoMode, liveConfigured],
  );

  const handleRequeue = useCallback(
    async (jobId: string) => {
      if (demoMode || !liveConfigured) return;
      setBusyJobId(jobId);
      try {
        await requeueProblemJob(config.apiUrl, config.token, jobId);
        setRefreshIndex((value) => value + 1);
      } catch (jobError) {
        setError(
          jobError instanceof Error
            ? `Could not requeue job: ${jobError.message}`
            : "Could not requeue job.",
        );
      } finally {
        setBusyJobId(null);
      }
    },
    [config.apiUrl, config.token, demoMode, liveConfigured],
  );

  const totals = useMemo(() => {
    const inbox = snapshot.leads.filter(
      (lead) => !lead.application_status,
    ).length;
    const applied = snapshot.leads.filter(
      (lead) =>
        lead.application_status && lead.application_status !== "ignored",
    ).length;
    const pendingJobs = snapshot.queue.counts
      .filter((row) => row.status === "pending" || row.status === "failed")
      .reduce((sum, row) => sum + Number(row.count), 0);
    return { leads: snapshot.leads.length, inbox, applied, pendingJobs };
  }, [snapshot]);

  return (
    <main className="min-h-screen bg-ink text-slate-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,138,61,0.13),transparent_34%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.16),transparent_34%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,auto,42px_42px,42px_42px]" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
        <Header
          demoMode={demoMode}
          loading={loading}
          generatedAt={snapshot.generated_at}
          onRefresh={refresh}
        />

        <ConnectPanel
          key={`${config.apiUrl}:${config.token}`}
          initialApiUrl={config.apiUrl}
          initialToken={config.token}
          connected={!demoMode}
          error={error}
          onSave={saveConnection}
          onUseDemo={useDemo}
        />

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Visible leads", totals.leads, "latest snapshot window"],
            ["Needs triage", totals.inbox, "no owner outcome yet"],
            ["Active applications", totals.applied, "non-ignored outcomes"],
            ["Queue backlog", totals.pendingJobs, "pending + retrying"],
          ].map(([label, value, hint]) => (
            <div
              key={label}
              className="rounded-3xl border border-line bg-panel/75 p-4 backdrop-blur"
            >
              <div className="text-sm text-mist">{label}</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
                {value}
              </div>
              <div className="mt-1 text-xs text-slate-500">{hint}</div>
            </div>
          ))}
        </section>

        <SourceHealthStrip rows={snapshot.source_health} />
        <Suspense
          fallback={
            <div
              className="panel h-96 animate-pulse"
              aria-label="Loading metrics"
            />
          }
        >
          <MetricsSection snapshot={snapshot} />
        </Suspense>
        <LeadInbox
          leads={snapshot.leads}
          busyLeadId={busyLeadId}
          onAction={(lead, status) => void handleLeadAction(lead, status)}
        />
        <QueueStrip
          queue={snapshot.queue}
          liveMode={!demoMode}
          busyJobId={busyJobId}
          onRequeue={(jobId) => void handleRequeue(jobId)}
        />

        <footer className="pb-5 text-center text-xs text-slate-500">
          lead-radar is a zero-cost portfolio demo. Exactly-once Discord
          delivery is intentionally not claimed; uncertain sends stay
          inspectable.
        </footer>
      </div>
    </main>
  );
}
