import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConnectPanel } from "./components/ConnectPanel";
import { Sidebar } from "./components/Sidebar";
import { LeadInbox } from "./components/LeadInbox";
import { QueueStrip } from "./components/QueueStrip";
import { SourceHealthStrip } from "./components/SourceHealthStrip";
import { buildDemoSnapshot } from "./demoData";
import {
  acknowledgeProblemJob,
  fetchSnapshot,
  normalizeDashboardApiUrl,
  postLeadAction,
  requeueProblemJob,
} from "./lib/api";
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
    apiUrl: normalizeDashboardApiUrl(
      localStorage.getItem(API_STORAGE_KEY) ??
        (import.meta.env.VITE_DASHBOARD_API_URL as string | undefined) ??
        "",
    ),
    token: localStorage.getItem(TOKEN_STORAGE_KEY) ?? "",
  };
}

function actionableQueueCount(
  rows: DashboardSnapshot["queue"]["counts"],
): number {
  return rows
    .filter((row) => row.status !== "succeeded" && row.status !== "cancelled")
    .reduce((sum, row) => sum + Number(row.count), 0);
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
            ? `Live connection failed: ${fetchError.message}. Existing data remains shown; retry the connection to refresh it.`
            : "Live connection failed. Existing data remains shown; retry the connection to refresh it.",
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
    const normalizedUrl = normalizeDashboardApiUrl(apiUrl);
    localStorage.setItem(API_STORAGE_KEY, normalizedUrl);
    localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    setConfig({ apiUrl: normalizedUrl, token: token.trim() });
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

  const handleAcknowledge = useCallback(
    async (jobId: string) => {
      if (demoMode || !liveConfigured) return;
      setBusyJobId(jobId);
      try {
        await acknowledgeProblemJob(config.apiUrl, config.token, jobId);
        setRefreshIndex((value) => value + 1);
      } catch (jobError) {
        setError(
          jobError instanceof Error
            ? `Could not acknowledge job: ${jobError.message}`
            : "Could not acknowledge job.",
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
    const activeJobs = actionableQueueCount(snapshot.queue.counts);
    return { leads: snapshot.leads.length, inbox, applied, activeJobs };
  }, [snapshot]);

  return (
    <div className="app-shell">
      <Sidebar
        live={!demoMode}
        endpoint={config.apiUrl}
        counts={{ inbox: totals.inbox, queue: totals.activeJobs }}
      />
      <div className="main-shell">
        <header className="topbar" id="overview" data-enter>
          <div>
            <div className="eyebrow">Zero-cost reliability demo</div>
            <h1>Today&apos;s lead queue.</h1>
            <p className="lead-copy">
              HN Who&apos;s Hiring, GitHub bounty issues, and Remotive in one
              owner-controlled inbox, with durable queue state visible beside
              every source.
            </p>
          </div>
          <div className="top-actions">
            <span className="pill">
              Snapshot{" "}
              {snapshot.generated_at
                ? new Date(snapshot.generated_at).toLocaleTimeString()
                : "—"}
            </span>
            <button
              className="button primary"
              type="button"
              disabled={loading}
              onClick={refresh}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <main className="page-grid">
          <ConnectPanel
            key={`${config.apiUrl}:${config.token}`}
            initialApiUrl={config.apiUrl}
            initialToken={config.token}
            connected={!demoMode}
            loading={loading}
            error={error}
            onSave={saveConnection}
            onUseDemo={useDemo}
          />

          <section className="overview-grid" aria-label="Snapshot totals">
            <article className="panel overview-hero" data-enter>
              <div>
                <div className="eyebrow">Needs triage</div>
                <p className="hero-number">{totals.inbox}</p>
                <p className="hero-label">
                  posts waiting for an owner decision
                </p>
              </div>
              <div className="radar-visual" aria-hidden="true" />
            </article>
            <article className="panel stat-card">
              <span className="stat-label">Visible leads</span>
              <strong className="stat-value">{totals.leads}</strong>
              <span className="stat-hint">latest snapshot window</span>
            </article>
            <article className="panel stat-card">
              <span className="stat-label">Applications</span>
              <strong className="stat-value">{totals.applied}</strong>
              <span className="stat-hint">non-ignored outcomes</span>
            </article>
          </section>

          <div className="workspace-grid">
            <LeadInbox
              leads={snapshot.leads}
              busyLeadId={busyLeadId}
              onAction={(lead, status) => void handleLeadAction(lead, status)}
            />
            <div className="side-stack">
              <SourceHealthStrip rows={snapshot.source_health} />
              <section className="panel rail-panel">
                <div className="eyebrow">Backlog</div>
                <h2>Queue pressure</h2>
                <p className="hero-number queue-pressure-number">
                  {totals.activeJobs}
                </p>
                <p className="section-copy">
                  active or inspectable Discord work; excludes succeeded and
                  cancelled jobs
                </p>
              </section>
            </div>
          </div>

          <Suspense
            fallback={
              <div className="panel metrics-panel">
                <h2>Loading metrics</h2>
              </div>
            }
          >
            <MetricsSection snapshot={snapshot} />
          </Suspense>
          <QueueStrip
            queue={snapshot.queue}
            liveMode={!demoMode}
            busyJobId={busyJobId}
            onRequeue={(jobId) => void handleRequeue(jobId)}
            onAcknowledge={(jobId) => void handleAcknowledge(jobId)}
          />
          <footer className="footer-note">
            Exactly-once Discord delivery is intentionally not claimed.
            Uncertain sends remain inspectable.
          </footer>
        </main>
      </div>
    </div>
  );
}
