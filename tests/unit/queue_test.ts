import { assert, assertEquals } from "jsr:@std/assert@1";
import { nextRetryAt, retryDelaySeconds, stableHash } from "../../supabase/functions/_shared/queue.ts";

Deno.test("retry backoff is deterministic, bounded, and idempotency-key aware", () => {
  const first = retryDelaySeconds(1, "lead-alert:hn:1");
  const firstAgain = retryDelaySeconds(1, "lead-alert:hn:1");
  const second = retryDelaySeconds(2, "lead-alert:hn:1");
  const large = retryDelaySeconds(20, "lead-alert:hn:1");

  assertEquals(first, firstAgain);
  assert(second > first);
  assert(large <= 1080);
  assert(retryDelaySeconds(1, "lead-alert:hn:2") >= 15);
  assert(retryDelaySeconds(1, "lead-alert:hn:2") < 18);
});

Deno.test("nextRetryAt honors a longer provider retry-after", () => {
  const withoutRetryAfter = Date.parse(nextRetryAt(1, "job-a"));
  const withRetryAfter = Date.parse(nextRetryAt(1, "job-a", 600));
  assert(withRetryAfter - withoutRetryAfter > 60_000);
});

Deno.test("stableHash is stable and unsigned", () => {
  assertEquals(stableHash("lead-radar"), stableHash("lead-radar"));
  assert(stableHash("lead-radar") >= 0);
});
