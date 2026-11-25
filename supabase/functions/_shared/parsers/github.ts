import { compactWhitespace, truncate } from "../html.ts";
import type { JsonObject, NormalizedLead } from "../types.ts";

export interface GitHubLabel {
  name?: string;
}

export interface GitHubSearchItem {
  id: number;
  node_id?: string;
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  repository_url: string;
  created_at: string;
  updated_at?: string;
  comments?: number;
  state?: string;
  labels?: Array<string | GitHubLabel>;
  user?: { login?: string } | null;
  author_association?: string;
}

export interface GitHubSearchResponse {
  total_count?: number;
  incomplete_results?: boolean;
  items?: GitHubSearchItem[];
}

function labelNames(labels: GitHubSearchItem["labels"]): string[] {
  return (labels ?? [])
    .map((label) => typeof label === "string" ? label : label.name)
    .filter((name): name is string => Boolean(name));
}

function repositoryName(repositoryUrl: string): string | null {
  const parts = repositoryUrl.split("/").filter(Boolean);
  const reposIndex = parts.findIndex((part) => part === "repos");
  if (reposIndex >= 0 && parts.length >= reposIndex + 3) {
    return `${parts[reposIndex + 1]}/${parts[reposIndex + 2]}`;
  }
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : null;
}

function extractBountyAmount(text: string): string | null {
  const match = text.match(
    /(?:[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:USD|EUR|GBP))?|\bbounty\s+of\s+[$€£]?\s?\d[\d,]*(?:\.\d+)?\b)/i,
  );
  return match ? compactWhitespace(match[0]) : null;
}

export function parseGitHubIssue(item: GitHubSearchItem): NormalizedLead | null {
  if (!item.title || !item.html_url || !item.created_at) return null;
  const repo = repositoryName(item.repository_url);
  const labels = labelNames(item.labels);
  if (!labels.some((label) => label.toLowerCase() === "bounty")) return null;
  const body = item.body ?? "";
  const bounty = extractBountyAmount(`${item.title}\n${body}`);

  const metadata: JsonObject = {
    github_issue_number: item.number,
    github_issue_id: item.id,
    github_repository: repo,
    github_comments: item.comments ?? 0,
    github_author: item.user?.login ?? null,
    github_author_association: item.author_association ?? null,
    attribution: "GitHub Search API",
    parser: "github-bounty-v1",
  };

  return {
    external_id: item.node_id ?? String(item.id),
    canonical_url: item.html_url,
    title: truncate(compactWhitespace(item.title), 240),
    company: repo,
    location: null,
    salary: bounty,
    description: body,
    tags: labels.slice(0, 12),
    remote: null,
    posted_at: new Date(item.created_at).toISOString(),
    metadata,
  };
}

export function parseGitHubSearchResponse(response: GitHubSearchResponse): NormalizedLead[] {
  return (response.items ?? [])
    .map(parseGitHubIssue)
    .filter((lead): lead is NormalizedLead => lead !== null);
}
