import { assertEquals } from "jsr:@std/assert@1";
import {
  buildDiscordMessage,
  executeDiscordJob,
  sendDiscordWebhook,
} from "../../supabase/functions/_shared/discord.ts";
import type { JobRow } from "../../supabase/functions/_shared/types.ts";

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

function job(key = "test-job"): JobRow {
  return {
    id: crypto.randomUUID(),
    type: "discord_source_alert",
    idempotency_key: key,
    payload: { title: key, message: "test alert" },
    status: "claimed",
    priority: 100,
    attempts: 1,
    max_attempts: 5,
    run_at: new Date().toISOString(),
    leased_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
    lease_owner: "test-worker",
    last_error: null,
    last_response_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };
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

Deno.test("Discord 429 honors Retry-After headers and falls back to JSON when invalid", async () => {
  await withMockedFetch(
    () => Promise.resolve(response(429, "{}", { "retry-after": "5" })),
    async () => {
      const result = await sendDiscordWebhook("https://discord.test/webhook", {});
      assertEquals(result.outcome, "retryable_failure");
      assertEquals(result.retryAfterSeconds, 5);
    },
  );

  await withMockedFetch(
    () =>
      Promise.resolve(
        response(429, JSON.stringify({ retry_after: 7 }), { "retry-after": "not-a-number" }),
      ),
    async () => {
      const result = await sendDiscordWebhook("https://discord.test/webhook", {});
      assertEquals(result.outcome, "retryable_failure");
      assertEquals(result.retryAfterSeconds, 7);
    },
  );
});

Deno.test("Discord messages disable mention parsing for untrusted lead content", () => {
  const leadJob = job("mention-test");
  leadJob.type = "discord_lead_alert";
  leadJob.payload = {
    source: "hn",
    title: "@everyone remote job",
    description_snippet: "@here click this lure",
    canonical_url: "https://example.test/job",
  };

  const message = buildDiscordMessage(leadJob) as { allowed_mentions?: { parse?: unknown[] } };
  assertEquals(message.allowed_mentions?.parse, []);

  const operational = buildDiscordMessage(job()) as { allowed_mentions?: { parse?: unknown[] } };
  assertEquals(operational.allowed_mentions?.parse, []);
});

Deno.test("executeDiscordJob retries configuration failure without a network call", async () => {
  let fetchCalls = 0;
  await withMockedFetch(
    () => {
      fetchCalls += 1;
      return Promise.reject(new Error("network must not be called"));
    },
    async () => {
      const result = await executeDiscordJob(job(), undefined);
      assertEquals(result.outcome, "retryable_failure");
      assertEquals(result.error, "DISCORD_WEBHOOK_URL is not configured");
    },
  );
  assertEquals(fetchCalls, 0);
});
