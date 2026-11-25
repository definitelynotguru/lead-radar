export type LeadSource = "hn" | "github" | "remotive";
export type ApplicationStatus =
  | "applied"
  | "ignored"
  | "replied"
  | "rejected"
  | "interview"
  | "offer"
  | "closed";
export type JobStatus =
  | "pending"
  | "claimed"
  | "succeeded"
  | "failed"
  | "ambiguous"
  | "dead_lettered"
  | "cancelled";

export interface LeadRow {
  id: string;
  source: LeadSource;
  external_id: string;
  canonical_url: string;
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string;
  tags: string[];
  remote: boolean | null;
  posted_at: string | null;
  first_seen_at: string;
  application_status?: ApplicationStatus | null;
  applied_at?: string | null;
  owner_notes?: string | null;
  application_is_demo?: boolean | null;
}

export interface PostsBySourceRow {
  source: LeadSource;
  day: string;
  count: number;
}

export interface LatencyRow {
  source: LeadSource;
  sample_size: number;
  median_seconds: number | null;
  p90_seconds: number | null;
}

export interface ReplyRateRow {
  source: LeadSource;
  applications: number;
  replies: number;
  reply_rate_percent: number;
}

export interface SourceHealthRow {
  source: LeadSource;
  enabled: boolean;
  cadence_seconds: number;
  cursor: Record<string, unknown>;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_item_seen_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  leads_last_24h: number;
  total_leads: number;
}

export interface QueueCountRow {
  status: JobStatus;
  count: number;
}

export interface JobAttemptRow {
  attempt_number: number;
  status: string;
  error: string | null;
  response_status: number | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string;
}

export interface ProblemJobRow {
  id: string;
  type: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  last_response_status: number | null;
  updated_at: string;
  recent_attempts: JobAttemptRow[];
}

export interface FetchRunRow {
  id: string;
  source: LeadSource;
  started_at: string;
  finished_at: string | null;
  status: "success" | "partial" | "error" | "skipped" | null;
  http_status: number | null;
  item_count: number;
  new_lead_count: number;
  duration_ms: number | null;
  error_message: string | null;
  details: Record<string, unknown>;
}

export interface DeadLetterRow {
  id: string;
  job_id: string;
  type: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  reason: string;
  last_response_status: number | null;
  dead_at: string;
}

export interface DashboardSnapshot {
  generated_at: string;
  leads: LeadRow[];
  metrics: {
    posts_by_source: PostsBySourceRow[];
    apply_latency: LatencyRow[];
    reply_rates: ReplyRateRow[];
  };
  source_health: SourceHealthRow[];
  queue: {
    counts: QueueCountRow[];
    problem_jobs: ProblemJobRow[];
    recent_fetch_runs: FetchRunRow[];
    dead_letters: DeadLetterRow[];
  };
  meta: {
    demo_mode: boolean;
    snapshot_limit?: number;
  };
}
