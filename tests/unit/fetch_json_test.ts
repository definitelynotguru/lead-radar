import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { FetchError, fetchJson } from "../../supabase/functions/_shared/fetch_json.ts";

async function withMockedFetch(implementation: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("fetchJson timeout-like aborts remain status-less no-response errors", async () => {
  await withMockedFetch(
    () => Promise.reject(new DOMException("aborted", "AbortError")),
    async () => {
      const error = await assertRejects(() => fetchJson("https://example.test/data"), FetchError, "timed out");
      assertEquals(error.status, undefined);
    },
  );
});

Deno.test("fetchJson preserves upstream HTTP status errors", async () => {
  await withMockedFetch(
    () => Promise.resolve(new Response("unavailable", { status: 503 })),
    async () => {
      const error = await assertRejects(() => fetchJson("https://example.test/data"), FetchError, "HTTP 503");
      assertEquals(error.status, 503);
    },
  );
});
