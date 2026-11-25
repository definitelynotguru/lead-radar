import { assertEquals } from "jsr:@std/assert@1";
import { maybeAlertSourceFailure, maybeAlertSourceRecovery } from "../../supabase/functions/_shared/health.ts";
import type { Sql } from "../../supabase/functions/_shared/db.ts";

function fakeSql(consecutiveFailures: number) {
  const insertedKeys: string[] = [];

  async function tagged(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    await Promise.resolve();
    const text = strings.join("?");
    if (text.includes("select consecutive_failures")) {
      return [{ consecutive_failures: consecutiveFailures }];
    }
    if (text.includes("insert into jobs")) {
      insertedKeys.push(String(values[1]));
      return [];
    }
    throw new Error(`unexpected SQL: ${text}`);
  }

  const sql = Object.assign(tagged, { json: (value: unknown) => value }) as unknown as Sql;
  return { sql, insertedKeys };
}

Deno.test("source failure alerts respect per-source thresholds", async () => {
  const below = fakeSql(1);
  await maybeAlertSourceFailure(below.sql, "remotive", "upstream failed");
  assertEquals(below.insertedKeys, []);

  const atThreshold = fakeSql(2);
  await maybeAlertSourceFailure(atThreshold.sql, "remotive", "upstream failed");
  assertEquals(atThreshold.insertedKeys.length, 1);
  assertEquals(atThreshold.insertedKeys[0].startsWith("source-down:remotive:"), true);
});

Deno.test("source recovery alerts are gated on a previously alertable failure count", async () => {
  const below = fakeSql(0);
  await maybeAlertSourceRecovery(below.sql, "remotive", 1);
  assertEquals(below.insertedKeys, []);

  const atThreshold = fakeSql(0);
  await maybeAlertSourceRecovery(atThreshold.sql, "remotive", 2);
  assertEquals(atThreshold.insertedKeys.length, 1);
  assertEquals(atThreshold.insertedKeys[0].startsWith("source-recovered:remotive:"), true);
});
