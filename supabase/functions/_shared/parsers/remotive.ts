import { compactWhitespace, htmlToText, truncate } from "../html.ts";
import type { JsonObject, NormalizedLead } from "../types.ts";

export interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name?: string;
  company_logo?: string;
  company_logo_url?: string;
  category?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  tags?: string[];
}

export interface RemotiveResponse {
  "00-warning"?: string;
  "0-legal-notice"?: string;
  "job-count"?: number;
  "total-job-count"?: number;
  jobs?: RemotiveJob[];
}

export function parseRemotiveJob(job: RemotiveJob, legalNotice?: string): NormalizedLead | null {
  if (!job.id || !job.url || !job.title) return null;
  const postedAt = job.publication_date ? new Date(job.publication_date) : null;
  if (postedAt && Number.isNaN(postedAt.getTime())) return null;
  const description = htmlToText(job.description ?? "");
  const metadata: JsonObject = {
    remotive_job_id: job.id,
    remotive_category: job.category ?? null,
    remotive_job_type: job.job_type ?? null,
    remotive_company_logo_url: job.company_logo_url ?? job.company_logo ?? null,
    attribution: legalNotice ?? "Remotive remote jobs API",
    parser: "remotive-v1",
  };

  return {
    external_id: String(job.id),
    canonical_url: job.url,
    title: truncate(compactWhitespace(job.title), 240),
    company: job.company_name ?? null,
    location: job.candidate_required_location ?? null,
    salary: job.salary ? compactWhitespace(job.salary) : null,
    description,
    tags: (job.tags ?? []).slice(0, 12),
    remote: true,
    posted_at: postedAt ? postedAt.toISOString() : null,
    metadata,
  };
}

export function parseRemotiveResponse(response: RemotiveResponse): NormalizedLead[] {
  const legalNotice = response["0-legal-notice"];
  return (response.jobs ?? [])
    .map((job) => parseRemotiveJob(job, legalNotice))
    .filter((lead): lead is NormalizedLead => lead !== null);
}
