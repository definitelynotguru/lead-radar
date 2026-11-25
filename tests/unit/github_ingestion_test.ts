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

Deno.test("GitHub ingestion treats incomplete upstream results as fatal", async () => {
  const fakeFetch: FetchJsonFn = async <T>(): Promise<{ data: T; status: number }> => {
    await Promise.resolve();
    return { data: { total_count: 1, incomplete_results: true, items: [] } as T, status: 200 };
  };

  const output = await fetchGitHubIngestion({}, fakeFetch);
  assertEquals(output.fatalError?.includes("incomplete_results=true"), true);
});
