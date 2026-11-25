import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  type HnItem,
  isWhoHiringThread,
  parseHnComment,
  parseHnComments,
} from "../../supabase/functions/_shared/parsers/hn.ts";
import {
  type GitHubSearchResponse,
  parseGitHubSearchResponse,
} from "../../supabase/functions/_shared/parsers/github.ts";
import { parseRemotiveResponse, type RemotiveResponse } from "../../supabase/functions/_shared/parsers/remotive.ts";

async function readFixture<T>(path: string): Promise<T> {
  return JSON.parse(await Deno.readTextFile(path)) as T;
}

Deno.test("HN parser handles real Who's Hiring comments", async () => {
  const comments = await readFixture<HnItem[]>("tests/fixtures/hn/top-level-comments.json");
  const leads = parseHnComments(comments, 50338728);

  assertEquals(leads.length, comments.length);
  assertEquals(leads[0].external_id, String(comments[0].id));
  assertEquals(leads[0].canonical_url, `https://news.ycombinator.com/item?id=${comments[0].id}`);
  assertEquals(leads[0].company, "Fly.io");
  assertEquals(leads[0].remote, true);
  assertMatch(leads[0].salary ?? "", /\$190k/i);
  assert(!leads[0].description.includes("<p>"));
  assert(leads[0].description.includes("\n\nHey folks"));
  assert(!leads[0].description.includes("equityHey folks"));
  assert(!leads[0].description.includes("&#x2F;"));
  assertEquals(leads[0].metadata.hn_thread_id, 50338728);
});

Deno.test("HN parser drops deleted, dead, non-comment, and textless items", () => {
  const live = {
    id: 1,
    type: "comment",
    time: 1_700_000_000,
    text: "Example | Remote | $100k<br/>TypeScript role",
  } satisfies HnItem;

  assert(parseHnComment(live) !== null);
  assertEquals(parseHnComment({ ...live, deleted: true }), null);
  assertEquals(parseHnComment({ ...live, dead: true }), null);
  assertEquals(parseHnComment({ ...live, type: "story" }), null);
  assertEquals(parseHnComment({ ...live, text: undefined }), null);
});

Deno.test("HN thread recognizer accepts hiring and rejects wants-to-be-hired titles", async () => {
  const thread = await readFixture<HnItem>("tests/fixtures/hn/who-is-hiring-thread.json");
  assert(isWhoHiringThread(thread));
  assert(!isWhoHiringThread({ ...thread, title: "Ask HN: Who wants to be hired? (November 2026)" }));
});

Deno.test("GitHub parser handles a real bounty search response", async () => {
  const response = await readFixture<GitHubSearchResponse>("tests/fixtures/github/search-issues-bounty.json");
  const leads = parseGitHubSearchResponse(response);

  assertEquals(leads.length, response.items?.length);
  assertEquals(leads[0].external_id, response.items?.[0].node_id);
  assertEquals(leads[0].company, "tradermarketcap/tradermarketcap-open");
  assert(leads[0].tags.includes("bounty"));
  assertEquals(leads[0].metadata.attribution, "GitHub Search API");
  assert(!Number.isNaN(Date.parse(leads[0].posted_at ?? "")));

  const withoutBountyLabel = {
    ...response,
    items: (response.items ?? []).map((item) => ({ ...item, labels: [{ name: "bug" }] })),
  };
  assertEquals(parseGitHubSearchResponse(withoutBountyLabel).length, 0);
});

Deno.test("Remotive parser handles a real API response and retains attribution", async () => {
  const response = await readFixture<RemotiveResponse>("tests/fixtures/remotive/remote-jobs.json");
  const leads = parseRemotiveResponse(response);

  assertEquals(leads.length, 2);
  assertEquals(leads[0].company, "TELUS Digital");
  assertEquals(leads[0].location, "USA");
  assertEquals(leads[0].remote, true);
  assert(String(leads[0].metadata.attribution).includes("Remotive"));
  assert(!leads[0].description.includes("<p"));
});

Deno.test("GitHub and Remotive parsers drop malformed dates instead of poisoning a batch", async () => {
  const github = await readFixture<GitHubSearchResponse>("tests/fixtures/github/search-issues-bounty.json");
  const malformedGithub = {
    ...github,
    items: [
      { ...github.items![0], created_at: "not-a-date" },
      ...github.items!.slice(1),
    ],
  };
  assertEquals(parseGitHubSearchResponse(malformedGithub).length, (github.items?.length ?? 0) - 1);

  const remotive = await readFixture<RemotiveResponse>("tests/fixtures/remotive/remote-jobs.json");
  const malformedRemotive = {
    ...remotive,
    jobs: [
      { ...remotive.jobs![0], publication_date: "not-a-date" },
      ...remotive.jobs!.slice(1),
    ],
  };
  assertEquals(parseRemotiveResponse(malformedRemotive).length, 1);
});
