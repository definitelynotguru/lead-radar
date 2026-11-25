# ADR 0002: Split source SLA instead of one uniform five-minute promise

Status: accepted

## Context

The product asks for alerts within five minutes of a post going up, but the three official APIs do not expose equally
fresh data.

- HN exposes the current Who's Hiring thread and comment IDs promptly through its official Firebase-backed API.
- GitHub Search exposes newly created public issues promptly enough for minute-level polling, subject to search indexing
  and rate limits.
- Remotive's public API is delayed by approximately 24 hours and its documentation asks consumers not to exceed about
  four requests per day.

A uniform five-minute SLA would either be false for Remotive or encourage an unofficial scraping path.

## Decision

Use a split SLA:

- HN and GitHub: target p95 under five minutes from first visibility in the official API to queueing a Discord alert.
- Remotive: best-effort freshness, with a compliant cadence no faster than once every six hours.

The user-facing documentation and source-health model state this difference explicitly. Remotive ingestion retains
Remotive attribution rather than hiding the source constraint.

## Measurement model

The five-minute clock starts when an item is first visible through the official upstream API, not when the employer
originally pressed submit. The repo cannot observe time before first API visibility. `posted_at` is retained for domain
reporting, while `first_seen_at` and fetch-run timestamps are retained for pipeline measurement. `time_to_apply` uses
the post timestamp for the owner workflow metric; ingestion latency uses first-seen/fetch timing operationally.

The initial implementation does not yet compute a direct p95 alert-latency chart. It keeps enough timestamps to add that
measurement without changing lead identity.

## Consequences

Positive:

- Claims remain technically honest.
- Fast sources are not slowed down by Remotive's cadence.
- Remotive attribution and API-use expectations are respected.

Negative:

- Remotive leads can already be a day old when first seen.
- GitHub freshness depends on search indexing as well as polling cadence.
