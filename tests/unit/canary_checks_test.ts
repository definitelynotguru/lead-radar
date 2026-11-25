import { assertEquals } from "jsr:@std/assert@1";
import { evaluateQueueCounts } from "../../supabase/functions/_shared/canary_checks.ts";

Deno.test("canary queue backlog threshold flips at 100 pending or failed jobs", () => {
  const at99 = evaluateQueueCounts({ pending: 60, failed: 39 }, 0);
  const at100 = evaluateQueueCounts({ pending: 60, failed: 40 }, 0);

  assertEquals(at99.queue_backlog.ok, true);
  assertEquals(at100.queue_backlog.ok, false);
});

Deno.test("canary queue checks fail on dead letters or ambiguous deliveries", () => {
  const checks = evaluateQueueCounts({ pending: 0, failed: 0, ambiguous: 2 }, 1);

  assertEquals(checks.queue_dead_letters.ok, false);
  assertEquals(checks.queue_ambiguous.ok, false);
  assertEquals(checks.queue_backlog.ok, true);

  const clean = evaluateQueueCounts({ pending: 0, failed: 0, ambiguous: 0 }, 0);
  assertEquals(clean.queue_dead_letters.ok, true);
  assertEquals(clean.queue_ambiguous.ok, true);
});
