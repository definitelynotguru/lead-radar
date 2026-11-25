# ADR 0001: Supabase-native control plane instead of Neon or an always-on VM

Status: accepted

## Context

The demo must cost exactly $0/month in recurring infrastructure. It still needs durable queue semantics, one-minute
ingestion, Discord delivery, a canary, and a dashboard API. The original constraints reject GitHub Actions as the
monitoring loop because scheduled Actions are best-effort and are not appropriate for minute-level recurring work.

Neon Free is attractive Postgres, but its free compute-hour budget is optimized for intermittently active applications.
A worker or loop awake every minute risks consuming scarce free compute hours. A small always-on VM is either not free
or introduces another operating system, process supervisor, secret store, and deployment path to maintain.

Supabase Free includes Postgres, Edge Functions, pg_cron, pg_net, and a monthly Edge Function invocation allowance that
is large compared with this workload.

## Decision

Use Supabase as the only stateful control plane:

- Supabase Postgres stores domain data, queue rows, attempts, fetch runs, canary runs, and source state.
- Supabase Cron invokes `ingest-tick` every minute and `canary` every fifteen minutes through `pg_net`.
- Supabase Edge Functions run ingestion, queue delivery, canary checks, and the owner-only dashboard API.
- The dashboard remains a static React bundle on GitHub Pages or Cloudflare Pages.
- Healthchecks.io or UptimeRobot supplies an external dead-man alert. GitHub Actions is used for CI and static
  deployment only.

Queue semantics deliberately live in ordinary durable Postgres tables. `pg_net` is only the cron transport; its internal
request tables are not treated as a durable application queue.

## Cost math

A one-minute cron has at most 44,640 invocations in a 31-day month. A fifteen-minute canary adds at most 2,976.
Combined, the upper bound is about 47,616 Edge Function invocations/month, about 9.5% of the documented 500,000 free
invocation allowance. Each tick is small because per-source cadences skip work that is not due, Remotive is limited to
four fetches/day, and HN backfill is bounded to 20 new comments per tick.

Static hosting on GitHub Pages or Cloudflare Pages is free for a public portfolio project. Discord webhooks and the
Healthchecks free tier are free. The expected recurring cost is therefore $0/month, within third-party free-tier policy
limits.

## Consequences

Positive:

- One operational control plane and one SQL schema.
- Durable transactional queue and domain state share the same Postgres invariants.
- No always-on VM, supervisor, Docker host, or separate queue service.
- The minute loop fits the free quota by a wide margin.

Negative:

- Supabase Free projects can pause after prolonged inactivity and have no automatic backups. This demo accepts that
  limitation; the external heartbeat does not remove the provider policy.
- Edge Function wall-clock and connection limits require incremental backfill rather than a large one-shot import.
- Cron delivery depends on `pg_net`. If cron or `pg_net` breaks, the external heartbeat is the detection mechanism
  rather than the recovery mechanism.
