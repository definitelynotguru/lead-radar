# Postmortem: local ingestion rollback from SQL operator precedence

Date: 2026-11-25 Status: pre-production implementation breakage, fixed before release

## Summary

During the first live local ingestion run, HN, GitHub, and Remotive fetches succeeded but each ingestion transaction
rolled back with `operator does not exist: text ->> unknown`. No duplicate leads or Discord jobs were committed. The
failure was reproducible with the SQL integration tests once a real batch was inserted.

## Impact

Local validation only. No production users existed and no external alert was sent. The failure delayed validation by one
debugging cycle.

## Timeline

- Live fixture capture and schema migration succeeded.
- The first `ingest-tick` run returned source errors after fetching upstream APIs.
- Manual SQL reproduction isolated the failure inside `ingest_leads_batch`.
- Concatenation expressions using `item->>'external_id'` were parenthesized.
- Integration tests were rerun and then a real local ingestion run inserted leads and jobs transactionally.

## Root cause

PostgreSQL operator precedence caused the JSON extraction expression to bind differently than intended in concatenations
such as `'lead-alert:' || source || ':' || item->>'external_id'`. The migration had passed schema creation, but that
only proves syntax, not correctness of the transaction body.

## Detection

The failure was visible in the `ingest-tick` response and fetch-run details. It was not hidden because insertion and
fetch-run finalization share one transaction.

## What worked

- Real API fixtures made parser behavior testable before the live run.
- Transactional ingestion meant the failed batch did not leave half-written leads without fetch-run state.
- The queue integration test could reproduce and verify the corrected SQL without needing Discord or Supabase cloud
  credentials.

## What did not work

- The initial migration smoke test checked successful application, not behavior of every SQL function.
- The first parser/unit tests did not exercise the SQL batch function.

## Corrective actions

Completed:

- Parenthesized JSON extraction in deterministic keys and payload construction.
- Added SQL integration coverage for duplicate ingestion, bounded retries, dead letters, ambiguous leases, and outcome
  aggregation.

Follow-up:

- Keep migrations behavior-tested in CI against ephemeral Postgres, not merely syntax-checked.
- Add direct p95 alert-latency metrics once production data exists.

## Lessons

A schema applying cleanly is not evidence that queue semantics work. This project now treats SQL functions as
application code and tests them against a real PostgreSQL service in CI.
