import { assertEquals } from "jsr:@std/assert@1";
import { runSourceIngestion, sourceIsDue } from "../../supabase/functions/_shared/ingest.ts";
import type { Sql } from "../../supabase/functions/_shared/db.ts";
import type { RuntimeEnv, SourceStateRow } from "../../supabase/functions/_shared/types.ts";

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

const runtimeEnv: RuntimeEnv = { databaseUrl: "postgresql://unused" };

function githubBountyItem() {
  return {
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
}

function fakeIngestionSql(state: SourceStateRow) {
  const runId = crypto.randomUUID();
  const finalizeStatuses: string[] = [];

  async function tagged(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    await Promise.resolve();
    const text = strings.join("?");
    if (text.includes("begin_fetch_run")) return [{ begin_fetch_run: runId }];
    if (text.includes("ingest_leads_batch")) {
      return [{ ingest_leads_batch: { inserted: 0, duplicates: 0, lead_ids: [] } }];
    }
    if (text.includes("finalize_fetch_run")) {
      finalizeStatuses.push(String(values[2]));
      return [];
    }
    if (text.includes("select consecutive_failures")) return [{ consecutive_failures: 0 }];
    if (text.includes("from source_states")) return [state];
    if (text.includes("from leads")) return [{ last_lead_at: null, recent_count: 0 }];
    throw new Error(`unexpected SQL: ${text}`);
  }

  const sql = Object.assign(tagged, {
    json: (value: unknown) => value,
    begin: async (callback: (tx: Sql) => Promise<void>) => await callback(sql as Sql),
  }) as unknown as Sql;
  return { sql, finalizeStatuses };
}

async function withMockedGitHubSearch(
  payload: Record<string, unknown>,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("runSourceIngestion persists fatal, partial, and clean outputs as error, partial, and success", async () => {
  const cases = [
    {
      name: "fatal",
      payload: { total_count: 1, incomplete_results: true, items: [] },
      expected: "error",
    },
    {
      name: "partial",
      payload: { total_count: 1, incomplete_results: true, items: [githubBountyItem()] },
      expected: "partial",
    },
    {
      name: "success",
      payload: { total_count: 1, incomplete_results: false, items: [githubBountyItem()] },
      expected: "success",
    },
  ] as const;

  for (const testCase of cases) {
    const sourceState = state(null);
    const harness = fakeIngestionSql(sourceState);
    await withMockedGitHubSearch(testCase.payload, async () => {
      const summary = await runSourceIngestion(harness.sql, sourceState, runtimeEnv);
      assertEquals(summary.status, testCase.expected, testCase.name);
    });
    assertEquals(harness.finalizeStatuses, [testCase.expected], testCase.name);
  }
});
