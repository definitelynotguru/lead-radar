import { useState } from "react";

interface ConnectPanelProps {
  initialApiUrl: string;
  initialToken: string;
  connected: boolean;
  loading: boolean;
  error: string | null;
  onSave: (apiUrl: string, token: string) => void;
  onUseDemo: () => void;
}

export function ConnectPanel({
  initialApiUrl,
  initialToken,
  connected,
  loading,
  error,
  onSave,
  onUseDemo,
}: ConnectPanelProps) {
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [token, setToken] = useState(initialToken);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!editing) {
    return (
      <section className="panel connection-strip" data-enter>
        <div className="connection-state">
          <span className={`status-dot ${connected ? "live" : ""}`} />
          <div>
            <strong>
              {connected ? "Live data connected" : "Exploring demo data"}
            </strong>
            <small>
              {connected
                ? apiUrl.replace(/^https?:\/\//, "")
                : "Connect dashboard-api when you are ready. Demo outcomes are explicitly marked."}
            </small>
          </div>
        </div>
        {loading ? <span className="pill">Syncing snapshot</span> : null}
        <button
          className="button ghost"
          type="button"
          onClick={() => setEditing(true)}
        >
          {connected ? "Change connection" : "Connect live data"}
        </button>
        {error ? <div className="error-banner">{error}</div> : null}
      </section>
    );
  }

  return (
    <section className="panel connection-panel" data-enter>
      <div>
        <div className="eyebrow">Owner access</div>
        <h2>Connect the live snapshot.</h2>
        <p className="section-copy">
          The static dashboard never ships the service-role key or database URL.
          The owner token stays in this browser's local storage.
        </p>
        {(formError ?? error) ? (
          <div className="error-banner">{formError ?? error}</div>
        ) : null}
      </div>
      <div>
        <div className="connection-fields">
          <label>
            Dashboard API
            <input
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
              placeholder="https://project.supabase.co/functions/v1/dashboard-api"
              inputMode="url"
              autoComplete="off"
            />
          </label>
          <label>
            Owner token
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type="password"
              placeholder="owner access token"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="connection-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => {
              const trimmedUrl = apiUrl.trim();
              const trimmedToken = token.trim();
              try {
                const parsed = new URL(trimmedUrl);
                if (!["http:", "https:"].includes(parsed.protocol)) {
                  throw new Error("unsupported protocol");
                }
              } catch {
                setFormError("Enter a valid http(s) dashboard API URL.");
                return;
              }
              if (!trimmedToken) {
                setFormError("Enter the owner access token.");
                return;
              }
              setFormError(null);
              setEditing(false);
              onSave(trimmedUrl, trimmedToken);
            }}
          >
            Connect live data
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              setFormError(null);
              setEditing(false);
              onUseDemo();
            }}
          >
            Explore demo data
          </button>
        </div>
      </div>
    </section>
  );
}
