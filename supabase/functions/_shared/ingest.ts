import { asPostgresJson, type Sql } from "./db.ts";
import { evaluateQuietAfterSuccess, maybeAlertSourceFailure, maybeAlertSourceRecovery } from "./health.ts";
import { fetchGitHubIngestion } from "./ingestion/github.ts";
import { fetchHnIngestion } from "./ingestion/hn.ts";
import { fetchRemotiveIngestion } from "./ingestion/remotive.ts";
import type { IngestionOutput, LeadSource, RuntimeEnv, SourceRunSummary, SourceStateRow } from "./types.ts";

interface IngestBatchResult {
  inserted: number;
  duplicates: number;
  lead_ids: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 800) : "unknown ingestion error";
}

function sourceIsDue(state: SourceStateRow, now = new Date()): boolean {
  if (!state.last_run_at) return true;
  const elapsedSeconds = (now.getTime() - new Date(state.last_run_at).getTime()) / 1000;
  return elapsedSeconds + 2 >= state.cadence_seconds;
}

async function fetchForSource(source: LeadSource, state: SourceStateRow, env: RuntimeEnv): Promise<IngestionOutput> {
  if (source === "hn") return await fetchHnIngestion(state.cursor);
  if (source === "github") return await fetchGitHubIngestion(state.cursor, undefined, env.githubToken);
  return await fetchRemotiveIngestion(state.cursor);
}

async function finalizeError(
  sql: Sql,
  runId: string,
  source: LeadSource,
  message: string,
): Promise<void> {
  await sql`
    select finalize_fetch_run(
      ${runId}::uuid,
      ${source}::text::lead_source,
      'error',
      null::integer,
      0,
      0,
      ${message}::text,
      '{}'::jsonb,
      null::jsonb,
      null::timestamptz
    )
  `;
}

export async function runSourceIngestion(
  sql: Sql,
  state: SourceStateRow,
  env: RuntimeEnv,
): Promise<SourceRunSummary> {
  const source = state.source;
  const priorFailures = state.consecutive_failures;
  let runId: string | undefined;

  try {
    const runRows = await sql<Array<{ begin_fetch_run: string }>>`
      select begin_fetch_run(${source}::text::lead_source)
    `;
    runId = runRows[0]?.begin_fetch_run;
    if (!runId) throw new Error("begin_fetch_run did not return a run id");
    const currentRunId = runId;

    const output = await fetchForSource(source, state, env);
    const runStatus = output.errors.length > 0 ? "partial" : "success";
    let inserted = 0;
    let duplicates = 0;

    await sql.begin(async (tx) => {
      const ingestionRows = await tx<Array<{ ingest_leads_batch: IngestBatchResult }>>`
        select ingest_leads_batch(
          ${source}::text::lead_source,
          ${tx.json(asPostgresJson(output.leads))}
        )
      `;
      const ingestion = ingestionRows[0]?.ingest_leads_batch;
      inserted = Number(ingestion?.inserted ?? 0);
      duplicates = Number(ingestion?.duplicates ?? 0);

      const details = {
        ...output.diagnostics,
        duplicate_leads: duplicates,
        parser_errors: output.errors,
      };

      await tx`
        select finalize_fetch_run(
          ${currentRunId}::uuid,
          ${source}::text::lead_source,
          ${runStatus},
          ${output.httpStatus ?? null}::integer,
          ${output.rawItemCount}::integer,
          ${inserted}::integer,
          null::text,
          ${tx.json(asPostgresJson(details))},
          ${tx.json(asPostgresJson(output.cursor))},
          ${output.lastItemSeenAt ?? null}::timestamptz
        )
      `;
    });

    await maybeAlertSourceRecovery(sql, source, priorFailures);
    await evaluateQuietAfterSuccess(sql, source);

    return {
      source,
      status: runStatus,
      runId,
      itemCount: output.rawItemCount,
      newLeadCount: inserted,
      diagnostics: output.diagnostics,
      error: output.errors.length > 0 ? output.errors.join("; ").slice(0, 800) : undefined,
    };
  } catch (error) {
    const message = errorMessage(error);
    if (runId) {
      try {
        await finalizeError(sql, runId, source, message);
        await maybeAlertSourceFailure(sql, source, message);
      } catch (finalizeFailure) {
        return {
          source,
          status: "error",
          runId,
          itemCount: 0,
          newLeadCount: 0,
          error: `${message}; additionally failed to persist error state: ${errorMessage(finalizeFailure)}`,
        };
      }
    }

    return {
      source,
      status: "error",
      runId,
      itemCount: 0,
      newLeadCount: 0,
      error: message,
    };
  }
}

export async function runDueIngestion(sql: Sql, env: RuntimeEnv): Promise<SourceRunSummary[]> {
  const states = await sql<SourceStateRow[]>`
    select *
    from source_states
    where enabled
    order by source
  `;
  const results: SourceRunSummary[] = [];

  for (const state of states) {
    if (!sourceIsDue(state)) {
      results.push({
        source: state.source,
        status: "skipped",
        reason: `cadence ${state.cadence_seconds}s not yet due`,
        itemCount: 0,
        newLeadCount: 0,
      });
      continue;
    }
    results.push(await runSourceIngestion(sql, state, env));
  }

  return results;
}

export async function pingExternalHeartbeat(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
