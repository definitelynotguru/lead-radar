import { assertEquals } from "jsr:@std/assert@1";
import { sendDiscordWebhook } from "../../supabase/functions/_shared/discord.ts";

async function withMockedFetch(
  implementation: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

function response(status: number, body = "{}", headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

Deno.test("Discord webhook classification separates retry, permanent failure, and ambiguity", async () => {
  await withMockedFetch(() => Promise.resolve(response(429, JSON.stringify({ retry_after: 2 }))), async () => {
    const result = await sendDiscordWebhook("https://discord.test/webhook", {});
    assertEquals(result.outcome, "retryable_failure");
    assertEquals(result.retryAfterSeconds, 2);
  });

  await withMockedFetch(() => Promise.resolve(response(503)), async () => {
    const result = await sendDiscordWebhook("https://discord.test/webhook", {});
    assertEquals(result.outcome, "retryable_failure");
  });

  await withMockedFetch(() => Promise.resolve(response(400)), async () => {
    const result = await sendDiscordWebhook("https://discord.test/webhook", {});
    assertEquals(result.outcome, "permanent_failure");
  });

  await withMockedFetch(
    () => Promise.reject(new DOMException("aborted", "AbortError")),
    async () => {
      const result = await sendDiscordWebhook("https://discord.test/webhook", {});
      assertEquals(result.outcome, "ambiguous");
    },
  );
});
