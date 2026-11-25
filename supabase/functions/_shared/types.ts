export const SOURCES = ["hn", "github", "remotive"] as const;
export type LeadSource = (typeof SOURCES)[number];

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

export interface NormalizedLead {
  external_id: string;
  canonical_url: string;
  title: string;
  company?: string | null;
  location?: string | null;
  salary?: string | null;
  description: string;
  tags: string[];
  remote?: boolean | null;
  posted_at?: string | null;
  metadata: JsonObject;
  ingestion_hash?: string;
}

export interface SourceStateRow {
  source: LeadSource;
  enabled: boolean;
  cadence_seconds: number;
  cursor: JsonObject;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_item_seen_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
}

export type JobStatus =
  | "pending"
  | "claimed"
  | "succeeded"
  | "failed"
  | "ambiguous"
  | "dead_lettered"
  | "cancelled";

export interface JobRow {
  id: string;
  type: "discord_lead_alert" | "discord_source_alert" | "discord_canary_alert";
  idempotency_key: string;
  payload: JsonObject;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_at: string;
  leased_at: string | null;
  lease_expires_at: string | null;
  lease_owner: string | null;
  last_error: string | null;
  last_response_status: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface IngestionOutput {
  leads: NormalizedLead[];
  cursor: JsonObject;
  rawItemCount: number;
  httpStatus?: number;
  diagnostics: JsonObject;
  errors: string[];
  lastItemSeenAt?: string | null;
}

export interface SourceRunSummary {
  source: LeadSource;
  status: "success" | "partial" | "error" | "skipped";
  reason?: string;
  runId?: string;
  itemCount: number;
  newLeadCount: number;
  error?: string;
  diagnostics?: JsonObject;
}

export interface RuntimeEnv {
  databaseUrl: string;
  discordWebhookUrl?: string;
  githubToken?: string;
  ingestSecret?: string;
  canarySecret?: string;
  dashboardAccessToken?: string;
  healthchecksPingUrl?: string;
  healthchecksCanaryPingUrl?: string;
  allowInsecureLocal?: boolean;
}
