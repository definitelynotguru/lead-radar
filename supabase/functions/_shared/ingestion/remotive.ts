import { fetchJson } from "../fetch_json.ts";
import { parseRemotiveResponse, type RemotiveResponse } from "../parsers/remotive.ts";
import type { IngestionOutput, JsonObject } from "../types.ts";
import type { FetchJsonFn } from "./types.ts";

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs";

export async function fetchRemotiveIngestion(
  _cursor: JsonObject,
  fetcher: FetchJsonFn = fetchJson,
): Promise<IngestionOutput> {
  const response = await fetcher<RemotiveResponse>(REMOTIVE_URL, { timeoutMs: 12_000 });
  const leads = parseRemotiveResponse(response.data).slice(0, 100);
  const latestPostedAt = leads
    .map((lead) => lead.posted_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    leads,
    cursor: {
      last_query_at: new Date().toISOString(),
      total_job_count: response.data["total-job-count"] ?? null,
      returned_job_count: response.data["job-count"] ?? response.data.jobs?.length ?? 0,
    },
    rawItemCount: response.data.jobs?.length ?? 0,
    httpStatus: response.status,
    diagnostics: {
      total_job_count: response.data["total-job-count"] ?? null,
      returned_job_count: response.data.jobs?.length ?? 0,
      parsed: leads.length,
      attribution_retained: Boolean(response.data["0-legal-notice"]),
    },
    errors: [],
    lastItemSeenAt: latestPostedAt,
  };
}
