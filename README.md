# lead-radar

Zero-cost lead monitoring for exactly three sources: HN Who's Hiring, GitHub issues labeled `bounty`, and Remotive
remote jobs. It ingests official API responses into Postgres, queues Discord alerts durably, exposes source health, and
renders a static owner dashboard.

This is a polished portfolio demo, not a claim of production-grade always-on operations. It is designed for **$0/month
recurring cost** within documented free tiers.

<table>
  <tr>
    <td><img src="docs/dashboard-live-overview.png" width="320" alt="Live lead-radar overview"></td>
    <td><img src="docs/dashboard-live-inbox.png" width="320" alt="Live lead-radar inbox and metrics"></td>
  </tr>
  <tr>
    <td><sub>Live local dashboard backed by real ingested API data: source health, queue state, and posts/source.</sub></td>
    <td><sub>Owner inbox with persisted Applied/Replied/Rejected/Ignored outcomes and apply-latency metrics.</sub></td>
  </tr>
</table>

## What it does

- Polls HN and GitHub every minute when due; polls Remotive at most four times/day.
- Discovers the current HN Who's Hiring thread from the official `whoishiring` user, diffs top-level `kids`, and
  incrementally backfills 20 comments per tick.
- Stores unique leads by `(source, external_id)` and creates deterministic `lead-alert:{source}:{external_id}` Discord
  jobs.
- Claims jobs through durable Postgres leases, uses bounded retries with deterministic jittered backoff, dead-letters
  exhausted jobs, and records every attempt.
- Marks timeout/network Discord sends as inspectable `ambiguous` instead of blindly reposting a message that may have
  been delivered.
- Detects consecutive source failures, source-quiet conditions, backlog growth, and dead letters. HN quiet detection
  understands the monthly burst instead of alerting merely because no comments exist yet.
- Runs a fifteen-minute canary covering parser smoke, configuration, database connectivity, source freshness, queue
  health, and end-to-end persistence.
- Pings Healthchecks only after non-degraded critical work, making Healthchecks a dead-man external signal rather than a
  success dashboard.
- Captures owner outcomes in `applications` and `outcomes`; computes posts/source, median/p90 time-to-apply, and reply
  rate/source.

## Architecture

```mermaid
flowchart LR
  HN[HN official API] --> INGEST[ingest-tick Edge Function]
  GH[GitHub Search API] --> INGEST
  RM[Remotive official API] --> INGEST

  CRON[Supabase Cron\npg_cron + pg_net] -->|every minute| INGEST
  CRON -->|every 15 minutes| CANARY[canary Edge Function]

  INGEST --> DB[(Supabase Postgres\nleads / applications / outcomes\njobs / attempts / fetch_runs)]
  INGEST --> DQUEUE[job claim + retry worker]
  DQUEUE --> DISCORD[Discord webhook]
  CANARY --> DB
  CANARY --> DQUEUE

  DB --> API[dashboard-api Edge Function]
  API --> STATIC[static React dashboard\nGitHub Pages or Cloudflare Pages]
  INGEST --> HC[Healthchecks ping\nonly after non-degraded work]
```

Detailed decisions:

- [ADR 0001: Supabase-native zero-cost control plane](docs/adr/0001-supabase-native-zero-cost.md)
- [ADR 0002: split source SLA](docs/adr/0002-split-source-sla.md)
- [Postmortem template](docs/postmortems/template.md)
- [Real pre-production breakage postmortem](docs/postmortems/2026-11-25-local-ingest-sql-precedence.md)

## Cost and quota math

| Component                  |                                      Assumption | Free-tier fit                                     |
| -------------------------- | ----------------------------------------------: | ------------------------------------------------- |
| `ingest-tick`              |    at most 44,640 invocations in a 31-day month | 8.9% of Supabase's 500k Edge invocation allowance |
| `canary`                   |                 at most 2,976 invocations/month | 0.6% of the same allowance                        |
| combined control loop      |                at most 47,616 invocations/month | about 9.5%, before cache/cadence savings          |
| Remotive upstream requests |                                   at most 4/day | complies with Remotive guidance                   |
| database writes            | small batches; HN backfill max 20 comments/tick | low-volume portfolio workload                     |
| dashboard hosting          |                                   static assets | GitHub Pages or Cloudflare Pages free tier        |
| external heartbeat         |                               one or two checks | Healthchecks free tier                            |

Expected recurring infrastructure cost: **$0/month**. This depends on providers retaining their current free tiers and
on keeping secrets/rate limits configured correctly. Supabase Free projects can pause after extended inactivity and do
not include automatic backups; those are accepted demo limitations, not hidden production claims.

## Source freshness model

| Source                |       Cadence | Freshness claim                                                                                             |
| --------------------- | ------------: | ----------------------------------------------------------------------------------------------------------- |
| HN Who's Hiring       |  every minute | target p95 under 5 minutes from first official-API visibility to queued Discord alert                       |
| GitHub `label:bounty` |  every minute | target p95 under 5 minutes from first Search API visibility, subject to indexing/rate limits                |
| Remotive              | every 6 hours | best-effort; the official API is delayed about 24 hours and asks clients not to exceed about 4 requests/day |

The clock starts at first visibility through the official upstream API. The system cannot measure time before an item
exists in that API. Timestamps needed for a direct alert-latency p95 are retained (`posted_at`, `first_seen_at`,
fetch-run times), but this first version does not yet render that operational p95 chart.

## Reliability model

### What is guaranteed locally in Postgres

- Lead identity is unique on `(source, external_id)`.
- Discord lead jobs use deterministic idempotency keys, so ingestion retries do not create duplicate jobs.
- Job execution uses a lease and `skip locked` through SQL functions, so concurrent workers do not claim the same
  visible row.
- Retry count is bounded; exhausted or permanent failures move to `dead_letters` with payload and error history.
- Every job attempt is recorded, including ambiguous attempts.
- Fetch runs, source cursors, last success, consecutive failures, and canary results are durable and inspectable.

### What is not guaranteed

- Discord delivery is not exactly-once. A webhook timeout can mean Discord received the message but the response never
  arrived. Those cases become `ambiguous` and require owner inspection/requeue instead of automatic reposting.
- Cron invocation is at-least-once/best-effort. Missed invocations are not replayed as a precise schedule; the next tick
  uses source cadences and cursors.
- Supabase Cron uses `pg_net` as transport. `pg_net` is not treated as the durable lead queue.
- Supabase Free can pause inactive projects and does not provide automatic backups.
- GitHub Search freshness can lag indexing; unauthenticated search is rate-limited aggressively.
- This version has no multi-user access model. The static dashboard is public; the dashboard API requires an owner
  bearer token and never needs a service-role key in the browser.

## Repository layout

```text
supabase/migrations/          SQL schema and transactional queue functions
supabase/functions/_shared/   typed ingestion, parser, queue, health, Discord modules
supabase/functions/ingest-tick/
supabase/functions/canary/
supabase/functions/dashboard-api/
web/                          React/Vite/Tailwind/Recharts dashboard
tests/fixtures/               real captured API fixtures
tests/unit/                   parser, HN diff, and retry/backoff tests
tests/integration/            PostgreSQL queue/idempotency/outcome tests
scripts/                      local DB, migration, and deployment wizard scripts
docs/adr/                     architecture decisions
docs/postmortems/             template plus one real pre-production breakage
```

## Local validation and demo

Prerequisites: Docker, Node 24-ish, Deno 2.x. No Supabase account is required for the parser, queue, API, or dashboard
validation path.

```bash
cp .env.example .env

# start disposable Postgres on localhost:55432 and apply migrations
./scripts/local-db.sh start
./scripts/local-db.sh migrate

# run all local validation
deno task fmt:check
deno task lint
deno task check
deno task test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/lead_radar deno task test:integration
npm --prefix web ci
npm --prefix web run format:check
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run build
```

Run the Edge Functions locally with plain Deno:

```bash
# export these in each terminal, or use: set -a; source .env; set +a
export LEAD_RADAR_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/lead_radar
export ALLOW_INSECURE_LOCAL=true
export INGEST_SHARED_SECRET=local-ingest
export CANARY_SHARED_SECRET=local-canary
export DASHBOARD_ACCESS_TOKEN=local-test-token

# run each server in a separate terminal
PORT=8000 deno run --allow-net --allow-env --allow-read supabase/functions/dashboard-api/index.ts
PORT=8001 deno run --allow-net --allow-env --allow-read supabase/functions/ingest-tick/index.ts
PORT=8002 deno run --allow-net --allow-env --allow-read supabase/functions/canary/index.ts

curl -X POST -H 'x-lead-radar-secret: local-ingest' http://127.0.0.1:8001/
curl -X POST -H 'x-lead-radar-secret: local-canary' http://127.0.0.1:8002/
```

Then run the UI:

```bash
npm --prefix web run dev
# open http://localhost:5173
# API URL: http://127.0.0.1:8000/dashboard-api
# token: local-test-token
```

If `localhost` is unreachable in a browser because of IPv4/IPv6 resolution differences, use `127.0.0.1`; the dashboard
client also retries that local fallback automatically.

The checked-in screenshots show a local dashboard populated from live HN, GitHub, and Remotive API data. Optional
fallback demo rows in `web/src/demoData.ts` are explicitly labelled `demo` in both the UI metadata and outcome rows.

## Production setup path

The repeatable user-driven path is:

```bash
./scripts/provision-wizard.sh
```

The wizard opens the relevant dashboards, captures credentials into mode-0600 `.env`, deploys
migrations/functions/secrets through the Supabase CLI, generates the cron SQL with Vault entries, and walks through
GitHub Pages verification. It asks for user-only credentials because this repository session intentionally did not
include Supabase, Discord, Healthchecks, or Cloudflare credentials.

Manual sequence, if you prefer not to use the wizard:

1. Create a Supabase Free project and save the database password.
2. Run `supabase link --project-ref <ref>` with a personal access token.
3. Run `supabase db push --remote`.
4. Run `supabase functions deploy ingest-tick canary dashboard-api --remote --no-verify-jwt`.
5. Set the function secrets listed below.
6. Copy `supabase/cron-setup.sql`, replace the three placeholders, and run it in the SQL editor. It creates Vault
   secrets, a one-minute ingest cron, a fifteen-minute canary cron, and weekly cron-log cleanup.
7. Enable GitHub Pages with **Source: GitHub Actions**. `deploy-pages.yml` builds `web/dist`; Cloudflare Pages also
   works with build command `npm --prefix web run build` and output directory `web/dist`.
8. Open the static dashboard, enter `https://<project-ref>.supabase.co/functions/v1/dashboard-api`, and paste the owner
   dashboard token.

## Required environment variables

Edge Function secrets:

| Variable                       |    Required | Purpose                                               |
| ------------------------------ | ----------: | ----------------------------------------------------- |
| `LEAD_RADAR_DATABASE_URL`      |         yes | pooled Postgres connection string, transaction mode   |
| `DISCORD_WEBHOOK_URL`          |         yes | lead and operational alert delivery                   |
| `INGEST_SHARED_SECRET`         |         yes | shared secret Supabase cron sends to `ingest-tick`    |
| `CANARY_SHARED_SECRET`         |         yes | shared secret Supabase cron sends to `canary`         |
| `DASHBOARD_ACCESS_TOKEN`       |         yes | owner bearer token for dashboard snapshot/actions     |
| `HEALTHCHECKS_PING_URL`        | recommended | external dead-man ping after non-degraded ingest work |
| `HEALTHCHECKS_CANARY_PING_URL` |    optional | separate canary heartbeat                             |
| `GITHUB_TOKEN`                 | recommended | authenticated GitHub Search API access                |

Never put service-role keys in the static dashboard. The browser only stores the dashboard API URL and owner token in
`localStorage`.

## CI and deployment automation

- `ci.yml` runs Deno format/lint/typecheck/unit tests, PostgreSQL-backed integration tests with migrations, and web
  format/lint/typecheck/build.
- `deploy-pages.yml` deploys the static dashboard to GitHub Pages on pushes to `main` after Pages is enabled.
- GitHub Actions is intentionally not part of the monitoring path.

## Threat model and operational limitations

- **Public repo, private secrets:** all live credentials must be in `.env` locally or Supabase encrypted secrets. `.env`
  is ignored.
- **Bearer-token dashboard:** anyone with the owner token can mutate outcomes and requeue jobs. Rotate it if exposed.
  There is no per-user audit trail in v1.
- **Webhook secrecy:** anyone with the Discord webhook can post to the channel. Rotate it if exposed.
- **Cron/Vault visibility tradeoff:** Vault stores cron shared secrets, but Supabase documents that decrypted secrets
  can be visible in internal `pg_net` request rows while queued. This is acceptable for a single-owner demo but is not a
  high-security multi-tenant design.
- **Public static assets:** the UI bundle is public and exposes no privileged data. API authorization is enforced
  server-side in the Edge Function.
- **No direct table API:** all lead-radar tables enable RLS without public policies and revoke Data API role grants;
  reads/writes intentionally go only through the owner-token Edge Function database connection.
- **No backups on Supabase Free:** export or upgrade before using this for data you cannot lose.
- **Best-effort external dependencies:** HN, GitHub, Remotive, Discord, Supabase, and Healthchecks can degrade
  independently. The system surfaces that degradation; it does not pretend to eliminate it.

## Parser fixtures

Fixtures in `tests/fixtures/` were captured from live public API responses and are parser fixtures rather than
production seed data. The unit tests verify real HN HTML/text details, current monthly-thread recognition, real GitHub
bounty labels/attribution, and Remotive legal attribution/remote metadata.
