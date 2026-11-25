import { mapLimit } from "../async.ts";
import { fetchJson } from "../fetch_json.ts";
import { type HnItem, type HnUser, isWhoHiringThread, parseHnComments } from "../parsers/hn.ts";
import { hoursBetween } from "../time.ts";
import type { IngestionOutput, JsonObject, NormalizedLead } from "../types.ts";
import type { FetchJsonFn } from "./types.ts";

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const HN_BACKFILL_BATCH = 20;
const HN_LIVE_BATCH = 30;
const HN_DISCOVERY_TTL_HOURS = 6;
const HN_MONTHLY_REDISCOVERY_SECONDS = 60;
const HN_MAX_TRACKED_IDS = 10_000;

interface HnCursorShape {
  thread_id?: number;
  thread_title?: string;
  thread_posted_at?: string;
  discovery_checked_at?: string;
  seen_ids?: number[];
  backfill_complete?: boolean;
}

function readCursor(cursor: JsonObject): HnCursorShape {
  const seen = cursor.seen_ids;
  return {
    thread_id: typeof cursor.thread_id === "number" ? cursor.thread_id : undefined,
    thread_title: typeof cursor.thread_title === "string" ? cursor.thread_title : undefined,
    thread_posted_at: typeof cursor.thread_posted_at === "string" ? cursor.thread_posted_at : undefined,
    discovery_checked_at: typeof cursor.discovery_checked_at === "string" ? cursor.discovery_checked_at : undefined,
    seen_ids: Array.isArray(seen) ? seen.filter((id): id is number => typeof id === "number") : [],
    backfill_complete: cursor.backfill_complete === true,
  };
}

function itemUrl(id: number): string {
  return `${HN_API_BASE}/item/${id}.json`;
}

async function fetchItem(id: number, fetcher: FetchJsonFn): Promise<HnItem> {
  const response = await fetcher<HnItem>(itemUrl(id), { timeoutMs: 8_000 });
  return response.data;
}

async function discoverThread(
  fetcher: FetchJsonFn,
): Promise<{ thread: HnItem | null; errors: string[]; checkedIds: number[] }> {
  const userResponse = await fetcher<HnUser>(`${HN_API_BASE}/user/whoishiring.json`, { timeoutMs: 8_000 });
  const submitted = userResponse.data.submitted ?? [];
  const candidatesToCheck = submitted.slice(0, 12);
  const errors: string[] = [];

  const candidates = await mapLimit(candidatesToCheck, 4, async (id) => {
    try {
      return await fetchItem(id, fetcher);
    } catch (error) {
      errors.push(`discovery item ${id}: ${error instanceof Error ? error.message : "fetch failed"}`);
      return null;
    }
  });

  const threads = candidates
    .filter((item): item is HnItem => item !== null && isWhoHiringThread(item))
    .sort((left, right) => (right.time ?? 0) - (left.time ?? 0));

  return { thread: threads[0] ?? null, errors, checkedIds: candidatesToCheck };
}

function mergeSeenIds(existing: number[], newlySeen: number[]): number[] {
  const merged: number[] = [];
  const seen = new Set<number>();
  for (const id of [...existing, ...newlySeen]) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged.slice(-HN_MAX_TRACKED_IDS);
}

function sameUtcMonth(leftIso: string, rightIso: string): boolean {
  const left = new Date(leftIso);
  const right = new Date(rightIso);
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();
}

export async function fetchHnIngestion(
  cursorInput: JsonObject,
  fetcher: FetchJsonFn = fetchJson,
  now = new Date(),
): Promise<IngestionOutput> {
  const errors: string[] = [];
  const cursor = readCursor(cursorInput);
  const nowIso = now.toISOString();
  const discoveryAgeSeconds = cursor.discovery_checked_at
    ? (now.getTime() - new Date(cursor.discovery_checked_at).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  const trackingPreviousMonth = Boolean(
    cursor.thread_posted_at && !sameUtcMonth(cursor.thread_posted_at, nowIso),
  );
  const discoveryStale = !cursor.discovery_checked_at ||
    hoursBetween(cursor.discovery_checked_at, nowIso) >= HN_DISCOVERY_TTL_HOURS ||
    (trackingPreviousMonth && discoveryAgeSeconds >= HN_MONTHLY_REDISCOVERY_SECONDS);
  let threadId = cursor.thread_id;
  let threadTitle = cursor.thread_title;
  let threadPostedAt = cursor.thread_posted_at;
  let discoveryCheckedAt = cursor.discovery_checked_at;
  let threadChanged = false;

  if (!threadId || discoveryStale) {
    const discovery = await discoverThread(fetcher);
    discoveryCheckedAt = nowIso;
    if (discovery.thread?.id && discovery.thread.time) {
      threadChanged = threadId !== discovery.thread.id;
      threadId = discovery.thread.id;
      threadTitle = discovery.thread.title;
      threadPostedAt = new Date(discovery.thread.time * 1000).toISOString();
    } else if (!threadId) {
      return {
        leads: [],
        cursor: {
          ...cursorInput,
          discovery_checked_at: nowIso,
          backfill_complete: false,
        },
        rawItemCount: 0,
        diagnostics: {
          thread_discovery: "missing",
          checked_submission_ids: discovery.checkedIds,
        },
        errors: [...errors, ...discovery.errors],
      };
    }
  }

  if (!threadId) {
    throw new Error("HN Who's Hiring thread could not be discovered");
  }

  const thread = await fetchItem(threadId, fetcher);
  const kids = thread.kids ?? [];
  const priorSeenIds = threadChanged ? [] : cursor.seen_ids ?? [];
  const priorBackfillComplete = threadChanged ? false : cursor.backfill_complete;
  const seen = new Set(priorSeenIds);
  const unseenIds = kids.filter((id) => !seen.has(id));
  const batchSize = priorBackfillComplete ? HN_LIVE_BATCH : HN_BACKFILL_BATCH;
  const idsToFetch = unseenIds.slice(0, batchSize);
  const fetchFailures: string[] = [];

  const fetchedItems = await mapLimit(idsToFetch, 6, async (id) => {
    try {
      return await fetchItem(id, fetcher);
    } catch (error) {
      fetchFailures.push(`comment ${id}: ${error instanceof Error ? error.message : "fetch failed"}`);
      return null;
    }
  });
  errors.push(...fetchFailures);

  const successfulItems = fetchedItems.filter((item): item is HnItem => item !== null);
  const leads: NormalizedLead[] = parseHnComments(successfulItems, threadId);
  const newlySeenIds = successfulItems.map((item) => item.id);
  const nextSeenIds = mergeSeenIds(priorSeenIds, newlySeenIds);
  const nextSeenSet = new Set(nextSeenIds);
  const remainingIds = kids.filter((id) => !nextSeenSet.has(id));
  const backfillComplete = remainingIds.length === 0;
  const latestPostedAt = leads
    .map((lead) => lead.posted_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    leads,
    cursor: {
      thread_id: threadId,
      thread_title: threadTitle ?? thread.title ?? null,
      thread_posted_at: threadPostedAt ?? (thread.time ? new Date(thread.time * 1000).toISOString() : null),
      discovery_checked_at: discoveryCheckedAt ?? nowIso,
      seen_ids: nextSeenIds,
      backfill_complete: backfillComplete,
      kids_count: kids.length,
    },
    rawItemCount: successfulItems.length,
    diagnostics: {
      thread_id: threadId,
      thread_title: threadTitle ?? thread.title ?? null,
      thread_changed: threadChanged,
      kids_count: kids.length,
      unseen_before: unseenIds.length,
      fetched: successfulItems.length,
      parsed: leads.length,
      remaining_after_tick: remainingIds.length,
      backfill_complete: backfillComplete,
      fetch_failures: fetchFailures.length,
    },
    errors,
    lastItemSeenAt: latestPostedAt,
  };
}
