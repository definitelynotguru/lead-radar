import { fetchJson } from "../fetch_json.ts";
import { type GitHubSearchResponse, parseGitHubSearchResponse } from "../parsers/github.ts";
import type { IngestionOutput, JsonObject } from "../types.ts";
import type { FetchJsonFn } from "./types.ts";

const GITHUB_SEARCH_URL =
  "https://api.github.com/search/issues?q=is%3Aissue%20is%3Aopen%20is%3Apublic%20label%3Abounty&sort=created&order=desc&per_page=30&page=1";

export async function fetchGitHubIngestion(
  _cursor: JsonObject,
  fetcher: FetchJsonFn = fetchJson,
  githubToken?: string,
): Promise<IngestionOutput> {
  const headers: Record<string, string> = {
    "accept": "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (githubToken) headers.authorization = `Bearer ${githubToken}`;

  const response = await fetcher<GitHubSearchResponse>(GITHUB_SEARCH_URL, {
    timeoutMs: 10_000,
    headers,
  });
  const leads = parseGitHubSearchResponse(response.data).slice(0, 30);
  const latestPostedAt = leads
    .map((lead) => lead.posted_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const incompleteError = response.data.incomplete_results === true
    ? "GitHub Search returned incomplete_results=true; treating the page as incomplete"
    : undefined;

  return {
    leads,
    cursor: {
      last_query_at: new Date().toISOString(),
      total_count: response.data.total_count ?? null,
      incomplete_results: response.data.incomplete_results === true,
      newest_external_id: leads[0]?.external_id ?? null,
    },
    rawItemCount: response.data.items?.length ?? 0,
    httpStatus: response.status,
    diagnostics: {
      total_count: response.data.total_count ?? null,
      incomplete_results: response.data.incomplete_results === true,
      parsed: leads.length,
      authenticated: Boolean(githubToken),
    },
    errors: incompleteError && leads.length > 0 ? [incompleteError] : [],
    fatalError: incompleteError && leads.length === 0 ? incompleteError : undefined,
    lastItemSeenAt: latestPostedAt,
  };
}
