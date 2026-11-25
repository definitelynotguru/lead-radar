import { assertEquals } from "jsr:@std/assert@1";
import { fetchRemotiveIngestion } from "../../supabase/functions/_shared/ingestion/remotive.ts";
import type { FetchJsonFn } from "../../supabase/functions/_shared/ingestion/types.ts";

function remotiveJob(id: number) {
  return {
    id,
    url: `https://remotive.com/remote-jobs/${id}`,
    title: `Remote engineer ${id}`,
    company_name: "ExampleCo",
    publication_date: "2026-01-01T00:00:00Z",
    description: "<p>Remote work</p>",
  };
}

Deno.test("Remotive ingestion caps leads at 100 and preserves cursor diagnostics", async () => {
  const jobs = Array.from({ length: 105 }, (_, index) => remotiveJob(index + 1));
  const fakeFetch: FetchJsonFn = async <T>(): Promise<{ data: T; status: number }> => {
    await Promise.resolve();
    return {
      data: {
        "0-legal-notice": "Remotive attribution fixture",
        "job-count": 105,
        "total-job-count": 500,
        jobs,
      } as T,
      status: 200,
    };
  };

  const output = await fetchRemotiveIngestion({}, fakeFetch);

  assertEquals(output.leads.length, 100);
  assertEquals(output.rawItemCount, 105);
  assertEquals(output.httpStatus, 200);
  assertEquals(output.cursor.total_job_count, 500);
  assertEquals(output.cursor.returned_job_count, 105);
  assertEquals(output.diagnostics.attribution_retained, true);
  assertEquals(output.diagnostics.parsed, 100);
});
