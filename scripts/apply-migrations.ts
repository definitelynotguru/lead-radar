import postgres from "npm:postgres@3.4.5";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL") ?? Deno.env.get("SUPABASE_DB_URL");
if (!databaseUrl) {
  throw new Error("Set TEST_DATABASE_URL or SUPABASE_DB_URL");
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1") ? false : "require",
});

try {
  const entries = [...Deno.readDirSync("supabase/migrations")]
    .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  await sql`
    create table if not exists lead_radar_schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  const appliedRows = await sql<Array<{ version: string }>>`select version from lead_radar_schema_migrations`;
  const applied = new Set(appliedRows.map((row) => row.version));
  let appliedCount = 0;

  for (const name of entries) {
    if (applied.has(name)) {
      console.log(`skipping ${name}`);
      continue;
    }
    console.log(`applying ${name}`);
    const contents = await Deno.readTextFile(`supabase/migrations/${name}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`insert into lead_radar_schema_migrations (version) values (${name})`;
    });
    appliedCount++;
  }
  console.log(`applied ${appliedCount} migration(s)`);
} finally {
  await sql.end();
}
