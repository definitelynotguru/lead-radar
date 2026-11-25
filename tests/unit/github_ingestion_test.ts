import { assertEquals } from "jsr:@std/assert@1";
import { fetchGitHubIngestion } from "../../supabase/functions/_shared/ingestion/github.ts";
import type { FetchJsonFn } from "../../supabase/functions/_shared/ingestion/types.ts";

Deno.test("GitHub ingestion restricts bounty search to public repositories", async () => {
  let requestedUrl = "";
  const fakeFetch: FetchJsonFn = async <T>(url: string): Promise<{ data: T; status: number }> => {
    await Promise.resolve();
    requestedUrl = url;
    return { data: { total_count: 0, incomplete_results: false, items: [] } as T, status: 200 };
  };

  await fetchGitHubIngestion({}, fakeFetch);

  const query = new URL(requestedUrl).searchParams.get("q") ?? "";
  assertEquals(query, "is:issue is:open is:public label:bounty");
});

Deno.test("GitHub ingestion treats incomplete upstream results without usable leads as fatal", async () => {
  const fakeFetch: FetchJsonFn = async <T>(): Promise<{ data: T; status: number }> => {
    await Promise.resolve();
    return { data: { total_count: 1, incomplete_results: true, items: [] } as T, status: 200 };
  };

  const output = await fetchGitHubIngestion({}, fakeFetch);
  assertEquals(output.fatalError?.includes("incomplete_results=true"), true);
  assertEquals(output.errors, []);
});

Deno.test("GitHub ingestion keeps usable leads from incomplete upstream results partial", async () => {
  const item = {
    id: 42,
    node_id: "issue-42",
    number: 7,
    title: "$100 bounty: fix search indexing",
    body: "A real bounty description",
    html_url: "https://github.com/example/repo/issues/7",
    repository_url: "https://api.github.com/repos/example/repo",
    created_at: "2026-01-01T00:00:00Z",
    labels: [{ name: "bounty" }],
  };
  const fakeFetch: FetchJsonFn = async <T>(): Promise<{ data: T; status: number }> => {
    await Promise.resolve();
    return { data: { total_count: 1, incomplete_results: true, items: [item] } as T, status: 200 };
  };

  const output = await fetchGitHubIngestion({}, fakeFetch);
  assertEquals(output.fatalError, undefined);
  assertEquals(output.errors.length, 1);
  assertEquals(output.leads.length, 1);
});
