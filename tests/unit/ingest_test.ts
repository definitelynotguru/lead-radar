import { assertEquals } from "jsr:@std/assert@1";
import { sourceIsDue } from "../../supabase/functions/_shared/ingest.ts";
import type { SourceStateRow } from "../../supabase/functions/_shared/types.ts";

function state(lastRunAt: string | null, cadenceSeconds = 60): SourceStateRow {
  return {
    source: "github",
    enabled: true,
    cadence_seconds: cadenceSeconds,
    cursor: {},
    last_run_at: lastRunAt,
    last_success_at: null,
    last_error_at: null,
    last_item_seen_at: null,
    consecutive_failures: 0,
    last_error: null,
  };
}

Deno.test("sourceIsDue covers first run and cadence boundaries with slack", () => {
  const now = new Date("2026-01-01T00:01:00.000Z");

  assertEquals(sourceIsDue(state(null), now), true);
  assertEquals(sourceIsDue(state("2026-01-01T00:00:02.001Z"), now), false);
  assertEquals(sourceIsDue(state("2026-01-01T00:00:00.000Z"), now), true);
  assertEquals(sourceIsDue(state("2026-01-01T00:00:01.900Z"), now), true);
  assertEquals(sourceIsDue(state("2026-01-01T00:00:03.000Z"), now), false);
});
