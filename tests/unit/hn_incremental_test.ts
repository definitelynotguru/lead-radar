import { assert, assertEquals } from "jsr:@std/assert@1";
import { fetchHnIngestion } from "../../supabase/functions/_shared/ingestion/hn.ts";
import type { HnItem, HnUser } from "../../supabase/functions/_shared/parsers/hn.ts";
import type { FetchJsonFn } from "../../supabase/functions/_shared/ingestion/types.ts";

async function readFixture<T>(path: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(path)) as T;
}

Deno.test("HN ingestion diffs top-level kids and does not refetch successfully seen comments", async () => {
  const user = await readFixture<HnUser>("tests/fixtures/hn/whoishiring-user.json");
  const realThread = await readFixture<HnItem>("tests/fixtures/hn/who-is-hiring-thread.json");
  const comments = await readFixture<HnItem[]>("tests/fixtures/hn/top-level-comments.json");
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const thread = { ...realThread, kids: realThread.kids?.slice(0, 20) ?? [] };
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

  const first = await fetchHnIngestion({}, fakeFetch);
  assertEquals(first.leads.length, 8);
  assertEquals(first.errors.length, 12);
  assertEquals((first.cursor.seen_ids as number[]).length, 8);
  assertEquals(first.cursor.backfill_complete, false);
  assertEquals(first.diagnostics.unseen_before, 20);

  requested.length = 0;
  const second = await fetchHnIngestion(first.cursor, fakeFetch);
  const refetchedKnownComment = requested.some((url) =>
    comments.some((comment) => url.endsWith(`/item/${comment.id}.json`))
  );
  assert(!refetchedKnownComment);
  assertEquals(second.leads.length, 0);
  assertEquals(requested.filter((url) => url.endsWith("/user/whoishiring.json")).length, 0);
  assertEquals(second.cursor.discovery_checked_at, first.cursor.discovery_checked_at);
});
