import { assert, assertEquals } from "jsr:@std/assert@1";
import { fetchHnIngestion } from "../../supabase/functions/_shared/ingestion/hn.ts";
import type { HnItem, HnUser } from "../../supabase/functions/_shared/parsers/hn.ts";
import type { FetchJsonFn } from "../../supabase/functions/_shared/ingestion/types.ts";

const NOVEMBER_2026 = new Date("2026-11-25T12:00:00.000Z");

async function readFixture<T>(path: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(path)) as T;
}

function createFixtureFetch(user: HnUser, thread: HnItem, comments: HnItem[]) {
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const requested: string[] = [];
  const fakeFetch: FetchJsonFn = async <T>(url: string): Promise<{ data: T; status: number }> => {
    await Promise.resolve();
    requested.push(url);
    if (url.endsWith("/user/whoishiring.json")) return { data: user as T, status: 200 };
    const match = url.match(/\/item\/(\d+)\.json$/);
    if (!match) throw new Error(`unexpected fixture URL: ${url}`);
    const id = Number(match[1]);
    if (id === thread.id) return { data: thread as T, status: 200 };
    const comment = commentById.get(id);
    if (comment) return { data: comment as T, status: 200 };
    if ((user.submitted ?? []).includes(id)) {
      return { data: { id, type: "story", time: 1, title: "Ask HN: unrelated submission" } as T, status: 200 };
    }
    throw new Error(`missing fixture comment ${id}`);
  };
  return { fakeFetch, requested };
}

Deno.test("HN ingestion diffs top-level kids and does not refetch successfully seen comments", async () => {
  const user = await readFixture<HnUser>("tests/fixtures/hn/whoishiring-user.json");
  const realThread = await readFixture<HnItem>("tests/fixtures/hn/who-is-hiring-thread.json");
  const comments = await readFixture<HnItem[]>("tests/fixtures/hn/top-level-comments.json");
  const thread = { ...realThread, kids: realThread.kids?.slice(0, 20) ?? [] };
  const { fakeFetch, requested } = createFixtureFetch(user, thread, comments);

  const first = await fetchHnIngestion({}, fakeFetch, NOVEMBER_2026);
  assertEquals(first.leads.length, 8);
  assertEquals(first.errors.length, 12);
  assertEquals((first.cursor.seen_ids as number[]).length, 8);
  assertEquals(first.cursor.backfill_complete, false);
  assertEquals(first.diagnostics.unseen_before, 20);

  requested.length = 0;
  const second = await fetchHnIngestion(first.cursor, fakeFetch, NOVEMBER_2026);
  const refetchedKnownComment = requested.some((url) =>
    comments.some((comment) => url.endsWith(`/item/${comment.id}.json`))
  );
  assert(!refetchedKnownComment);
  assertEquals(second.leads.length, 0);
  assertEquals(requested.filter((url) => url.endsWith("/user/whoishiring.json")).length, 0);
  assertEquals(second.cursor.discovery_checked_at, first.cursor.discovery_checked_at);
});

Deno.test("HN ingestion rediscovers promptly after monthly rollover and resets thread backfill", async () => {
  const user = await readFixture<HnUser>("tests/fixtures/hn/whoishiring-user.json");
  const novemberThread = await readFixture<HnItem>("tests/fixtures/hn/who-is-hiring-thread.json");
  const novemberComments = await readFixture<HnItem[]>("tests/fixtures/hn/top-level-comments.json");
  const decemberComments = novemberComments.slice(0, 2).map((comment, index) => ({
    ...comment,
    id: 910000001 + index,
  }));
  const decemberThread: HnItem = {
    ...novemberThread,
    id: 60400000,
    time: 1796083200,
    title: "Ask HN: Who is hiring? (December 2026)",
    kids: decemberComments.map((comment) => comment.id),
  };
  const decemberUser = { ...user, submitted: [decemberThread.id, ...(user.submitted ?? [])] };
  const { fakeFetch, requested } = createFixtureFetch(decemberUser, decemberThread, decemberComments);

  const november = await fetchHnIngestion({}, fakeFetch, NOVEMBER_2026);
  assertEquals(november.cursor.thread_id, decemberThread.id);

  const decemberNow = new Date("2026-12-01T00:01:00.000Z");
  const rolledOverCursor = {
    ...november.cursor,
    thread_id: novemberThread.id,
    thread_posted_at: "2026-11-01T00:00:00.000Z",
    discovery_checked_at: "2026-12-01T00:00:00.000Z",
    backfill_complete: true,
    seen_ids: [123456789],
  };
  requested.length = 0;

  const december = await fetchHnIngestion(rolledOverCursor, fakeFetch, decemberNow);

  assertEquals(requested.filter((url) => url.endsWith("/user/whoishiring.json")).length, 1);
  assertEquals(december.cursor.thread_id, decemberThread.id);
  assertEquals(december.diagnostics.thread_changed, true);
  assertEquals(december.diagnostics.unseen_before, decemberComments.length);
  assert(!(december.cursor.seen_ids as number[]).includes(123456789));
});
