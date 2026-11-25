import { compactWhitespace, htmlToText, truncate } from "../html.ts";
import { unixToIso } from "../time.ts";
import type { JsonObject, NormalizedLead } from "../types.ts";

export interface HnItem {
  id: number;
  type?: string;
  by?: string;
  time?: number;
  title?: string;
  text?: string;
  kids?: number[];
  deleted?: boolean;
  dead?: boolean;
  parent?: number;
  url?: string;
}

export interface HnUser {
  id: string;
  submitted?: number[];
}

const META_PATTERN =
  /\b(remote|onsite|on-site|hybrid|full[- ]?time|part[- ]?time|contract|freelance|internship|visa|salary|equity|worldwide|any timezone)\b/i;
const COMPENSATION_PATTERN =
  /(?:[$€£]\s?\d[\d,]*(?:\.\d+)?k?(?:\s*[-–—]\s*(?:[$€£]\s?)?\d[\d,]*(?:\.\d+)?k?)?(?:\s*(?:USD|EUR|GBP|CAD|AUD))?(?:\s*\+?\s*equity)?|\b\d+\s?k\s*[-–—]\s*\d+\s?k\b)/i;

export function isWhoHiringThread(item: Pick<HnItem, "type" | "title">): boolean {
  return item.type === "story" && /^Ask HN:\s*Who is hiring\?/i.test(item.title ?? "");
}

function splitFirstLine(text: string): string[] {
  const firstLine = text.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? "";
  return firstLine.split("|").map((part) => compactWhitespace(part)).filter(Boolean);
}

function extractSalary(text: string): string | null {
  const match = text.match(COMPENSATION_PATTERN);
  return match ? compactWhitespace(match[0]) : null;
}

function extractTags(text: string): string[] {
  const technologies = [
    "TypeScript",
    "JavaScript",
    "React",
    "Node.js",
    "Python",
    "Django",
    "Rails",
    "Ruby",
    "Go",
    "Rust",
    "Postgres",
    "PostgreSQL",
    "Kubernetes",
    "AWS",
    "GCP",
    "Azure",
    "iOS",
    "Android",
    "Machine Learning",
    "LLM",
  ];
  const lower = text.toLowerCase();
  return technologies.filter((tag) => lower.includes(tag.toLowerCase())).slice(0, 8);
}

function cleanCompany(segment: string | undefined): string | null {
  if (!segment) return null;
  const cleaned = compactWhitespace(segment.replace(/^[-*•\s]+/, ""));
  return cleaned.length > 0 ? truncate(cleaned, 120) : null;
}

export function parseHnComment(item: HnItem, threadId?: number): NormalizedLead | null {
  if (item.deleted || item.dead || item.type !== "comment" || !item.text || !item.time) return null;

  const description = htmlToText(item.text);
  if (!description) return null;

  const segments = splitFirstLine(description);
  const firstLine = segments.join(" | ") || truncate(compactWhitespace(description), 180);
  const company = cleanCompany(segments[0]);
  const remote = /\bremote\b/i.test(firstLine) ? true : /\b(onsite|on-site)\b/i.test(firstLine) ? false : null;
  const locationSegment = segments.slice(1).find((segment) =>
    /remote|onsite|on-site|hybrid|worldwide|europe|america|usa|united states|uk|canada|australia|timezone/i.test(
      segment,
    )
  );
  const roleSegment = segments.slice(1).find((segment) =>
    !META_PATTERN.test(segment) && !COMPENSATION_PATTERN.test(segment)
  );

  const metadata: JsonObject = {
    hn_comment_id: item.id,
    hn_first_line: firstLine,
    parser: "hn-whoishiring-v1",
  };
  if (threadId) metadata.hn_thread_id = threadId;
  if (roleSegment) metadata.role_fragment = roleSegment;

  return {
    external_id: String(item.id),
    canonical_url: `https://news.ycombinator.com/item?id=${item.id}`,
    title: truncate(firstLine, 240),
    company,
    location: locationSegment ? truncate(locationSegment, 160) : null,
    salary: extractSalary(description),
    description,
    tags: extractTags(description),
    remote,
    posted_at: unixToIso(item.time),
    metadata,
  };
}

export function parseHnComments(items: HnItem[], threadId?: number): NormalizedLead[] {
  return items.map((item) => parseHnComment(item, threadId)).filter((lead): lead is NormalizedLead => lead !== null);
}
