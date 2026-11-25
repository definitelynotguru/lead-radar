import type { DashboardSnapshot, LeadRow, LeadSource } from "./types";

function isoDaysAgo(days: number, hours = 0): string {
  return new Date(
    Date.now() - days * 86_400_000 - hours * 3_600_000,
  ).toISOString();
}

function dayKey(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

const demoLeads: LeadRow[] = [
  {
    id: "demo-hn-1",
    source: "hn",
    external_id: "50342723",
    canonical_url: "https://news.ycombinator.com/item?id=50342723",
    title:
      "Fly.io | REMOTE (multiple countries) | Full time | $190k USD + equity",
    company: "Fly.io",
    location: "REMOTE (multiple countries)",
    salary: "$190k USD + equity",
    description:
      "Demo data: build and operate developer infrastructure across a globally distributed platform.",
    tags: ["Go", "Kubernetes", "Postgres"],
    remote: true,
    posted_at: isoDaysAgo(1, 4),
    first_seen_at: isoDaysAgo(1, 3),
    application_status: "replied",
    applied_at: isoDaysAgo(1, 1),
    owner_notes: "Demo action: strong fit, replied same day",
    application_is_demo: true,
  },
  {
    id: "demo-github-1",
    source: "github",
    external_id: "I_demo_bounty_1",
    canonical_url: "https://github.com/example/runtime/issues/128",
    title: "$500 bounty: make queue retry semantics crash-safe",
    company: "example/runtime",
    location: null,
    salary: "$500",
    description:
      "Demo data: reproduce the crash window, make retry state durable, and add regression coverage.",
    tags: ["bounty", "postgres", "typescript"],
    remote: null,
    posted_at: isoDaysAgo(0, 7),
    first_seen_at: isoDaysAgo(0, 6),
    application_status: "applied",
    applied_at: isoDaysAgo(0, 2),
    owner_notes: "Demo action: submitted implementation plan",
    application_is_demo: true,
  },
  {
    id: "demo-remotive-1",
    source: "remotive",
    external_id: "demo-remotive-1",
    canonical_url:
      "https://remotive.com/remote-jobs/software-dev/senior-react-full-stack-developer-demo",
    title: "Senior React Full-stack Developer",
    company: "TELUS Digital",
    location: "USA",
    salary: null,
    description:
      "Demo data: remote product engineering role ingested through the Remotive API with attribution retained.",
    tags: ["react", "typescript", "node"],
    remote: true,
    posted_at: isoDaysAgo(2, 5),
    first_seen_at: isoDaysAgo(2, 4),
    application_status: null,
  },
  {
    id: "demo-hn-2",
    source: "hn",
    external_id: "50338732",
    canonical_url: "https://news.ycombinator.com/item?id=50338732",
    title:
      "Simple Analytics | DevOps Engineer | REMOTE (worldwide, any timezone)",
    company: "Simple Analytics",
    location: "REMOTE (worldwide, any timezone)",
    salary: null,
    description:
      "Demo data: privacy-friendly analytics infrastructure, small team, high ownership.",
    tags: ["DevOps", "AWS", "PostgreSQL"],
    remote: true,
    posted_at: isoDaysAgo(3, 1),
    first_seen_at: isoDaysAgo(3),
    application_status: "rejected",
    applied_at: isoDaysAgo(2, 18),
    owner_notes: "Demo action: rejection captured as an outcome event",
    application_is_demo: true,
  },
  {
    id: "demo-github-2",
    source: "github",
    external_id: "I_demo_bounty_2",
    canonical_url: "https://github.com/example/search/issues/77",
    title: "Bounty: improve parser recall for malformed HTML job posts",
    company: "example/search",
    location: null,
    salary: "$250",
    description:
      "Demo data: add real fixtures, pin edge cases, and improve extraction without broad rewrites.",
    tags: ["bounty", "parsing", "testing"],
    remote: null,
    posted_at: isoDaysAgo(4, 8),
    first_seen_at: isoDaysAgo(4, 7),
    application_status: null,
  },
  {
    id: "demo-remotive-2",
    source: "remotive",
    external_id: "demo-remotive-2",
    canonical_url:
      "https://remotive.com/remote-jobs/software-dev/backend-platform-engineer-demo",
    title: "Backend Platform Engineer",
    company: "Remote Systems Co",
    location: "Worldwide",
    salary: "$140k - $170k",
    description:
      "Demo data: backend platform role used to demonstrate filtering, metrics, and owner actions.",
    tags: ["go", "postgres", "kubernetes"],
    remote: true,
    posted_at: isoDaysAgo(5, 3),
    first_seen_at: isoDaysAgo(5, 2),
    application_status: "ignored",
    applied_at: null,
    owner_notes:
      "Demo action: ignored because location constraints did not fit",
    application_is_demo: true,
  },
];

function volume(source: LeadSource, dayOffset: number): number {
  if (source === "hn") {
    return Math.max(0, 18 - dayOffset * 2 + ((dayOffset * 7) % 5));
  }
  if (source === "github") {
    return 2 + ((dayOffset * 5 + 3) % 7);
  }
  return 4 + ((dayOffset * 3 + 1) % 5);
}

export function buildDemoSnapshot(): DashboardSnapshot {
  const posts = [];
  for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
    for (const source of ["hn", "github", "remotive"] as const) {
      posts.push({
        source,
        day: dayKey(dayOffset),
        count: volume(source, dayOffset),
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    leads: demoLeads,
    metrics: {
      posts_by_source: posts,
      apply_latency: [
        {
          source: "hn",
          sample_size: 4,
          median_seconds: 7_200,
          p90_seconds: 32_400,
        },
        {
          source: "github",
          sample_size: 3,
          median_seconds: 18_000,
          p90_seconds: 86_400,
        },
        {
          source: "remotive",
          sample_size: 2,
          median_seconds: 43_200,
          p90_seconds: 129_600,
        },
      ],
      reply_rates: [
        { source: "hn", applications: 8, replies: 3, reply_rate_percent: 37.5 },
        {
          source: "github",
          applications: 5,
          replies: 2,
          reply_rate_percent: 40,
        },
        {
          source: "remotive",
          applications: 4,
          replies: 1,
          reply_rate_percent: 25,
        },
      ],
    },
    source_health: [
      {
        source: "hn",
        enabled: true,
        cadence_seconds: 60,
        cursor: { backfill_complete: true, thread_id: 50338728 },
        last_run_at: isoDaysAgo(0, 0.03),
        last_success_at: isoDaysAgo(0, 0.03),
        last_error_at: null,
        last_item_seen_at: isoDaysAgo(0, 5),
        consecutive_failures: 0,
        last_error: null,
        leads_last_24h: 27,
        total_leads: 214,
      },
      {
        source: "github",
        enabled: true,
        cadence_seconds: 60,
        cursor: {},
        last_run_at: isoDaysAgo(0, 0.03),
        last_success_at: isoDaysAgo(0, 0.03),
        last_error_at: null,
        last_item_seen_at: isoDaysAgo(0, 7),
        consecutive_failures: 0,
        last_error: null,
        leads_last_24h: 8,
        total_leads: 96,
      },
      {
        source: "remotive",
        enabled: true,
        cadence_seconds: 21600,
        cursor: {},
        last_run_at: isoDaysAgo(0, 3),
        last_success_at: isoDaysAgo(0, 3),
        last_error_at: null,
        last_item_seen_at: isoDaysAgo(1, 2),
        consecutive_failures: 0,
        last_error: null,
        leads_last_24h: 11,
        total_leads: 61,
      },
    ],
    queue: {
      counts: [
        { status: "pending", count: 2 },
        { status: "succeeded", count: 138 },
        { status: "ambiguous", count: 1 },
      ],
      problem_jobs: [
        {
          id: "demo-job-ambiguous",
          type: "discord_lead_alert",
          idempotency_key: "lead-alert:github:I_demo_bounty_1",
          payload: {
            title: "$500 bounty: make queue retry semantics crash-safe",
            source: "github",
          },
          status: "ambiguous",
          attempts: 1,
          max_attempts: 5,
          run_at: isoDaysAgo(0, 1),
          last_error: "Discord request timed out before a response",
          last_response_status: null,
          updated_at: isoDaysAgo(0, 1),
          recent_attempts: [
            {
              attempt_number: 1,
              status: "ambiguous",
              error: "Discord request timed out before a response",
              response_status: null,
              duration_ms: 10000,
              started_at: isoDaysAgo(0, 1),
              finished_at: isoDaysAgo(0, 1),
            },
          ],
        },
      ],
      recent_fetch_runs: [
        {
          id: "demo-run-1",
          source: "hn",
          started_at: isoDaysAgo(0, 0.03),
          finished_at: isoDaysAgo(0, 0.02),
          status: "success",
          http_status: 200,
          item_count: 20,
          new_lead_count: 4,
          duration_ms: 1340,
          error_message: null,
          details: { backfill_complete: true },
        },
      ],
      dead_letters: [],
    },
    meta: { demo_mode: true, snapshot_limit: 180 },
  };
}
