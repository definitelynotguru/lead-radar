import { assertEquals } from "jsr:@std/assert@1";
import { createDatabase } from "../../supabase/functions/_shared/db.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(origin: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error("dashboard-api test server did not start");
}

Deno.test("dashboard API rejects bad auth and invalid mutation input before database work", async () => {
  const port = 18100 + Math.floor(Math.random() * 700);
  const origin = `http://127.0.0.1:${port}`;
  const token = "integration-dashboard-token";
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-net",
      "--allow-env",
      "--allow-read",
      "supabase/functions/dashboard-api/index.ts",
    ],
    env: {
      LEAD_RADAR_DATABASE_URL: databaseUrl,
      DASHBOARD_ACCESS_TOKEN: token,
      PORT: String(port),
      HOST: "127.0.0.1",
    },
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();

  const sql = createDatabase(databaseUrl);
  const insertedJobIds: string[] = [];
  const insertedLeadIds: string[] = [];

  try {
    await waitForServer(origin);

    const missingAuth = await fetch(`${origin}/snapshot`);
    assertEquals(missingAuth.status, 401);

    const wrongAuth = await fetch(`${origin}/snapshot`, {
      headers: { authorization: "Bearer wrong" },
    });
    assertEquals(wrongAuth.status, 401);

    const validAuth = await fetch(`${origin}/snapshot`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assertEquals(validAuth.status, 200);

    const invalidStatus = await fetch(`${origin}/action`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ lead_id: crypto.randomUUID(), status: "not-a-status" }),
    });
    assertEquals(invalidStatus.status, 400);

    const malformedLeadId = await fetch(`${origin}/action`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ lead_id: "not-a-uuid", status: "applied" }),
    });
    assertEquals(malformedLeadId.status, 400);

    const malformedRequeueId = await fetch(`${origin}/jobs/requeue`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ job_id: "not-a-uuid" }),
    });
    assertEquals(malformedRequeueId.status, 400);

    const malformedAcknowledgeId = await fetch(`${origin}/jobs/acknowledge`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ job_id: "not-a-uuid" }),
    });
    assertEquals(malformedAcknowledgeId.status, 400);

    const leadRows = await sql<Array<{ id: string }>>`
      insert into leads (source, external_id, canonical_url, title, description, ingestion_hash)
      values (
        'hn',
        ${`dashboard-api-notes-${crypto.randomUUID()}`},
        'https://example.test/notes-lead',
        'Dashboard API notes test',
        'notes boundary test',
        'test-hash'
      )
      returning id
    `;
    const notesLeadId = leadRows[0].id;
    insertedLeadIds.push(notesLeadId);

    const acceptedNotes = await fetch(`${origin}/action`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ lead_id: notesLeadId, status: "applied", notes: "x".repeat(2000) }),
    });
    assertEquals(acceptedNotes.status, 200);

    const oversizedNotes = await fetch(`${origin}/action`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ lead_id: notesLeadId, status: "replied", notes: "x".repeat(2001) }),
    });
    assertEquals(oversizedNotes.status, 400);

    const storedNotes = await sql<Array<{ owner_notes: string | null }>>`
      select owner_notes from applications where lead_id = ${notesLeadId}::uuid
    `;
    assertEquals(storedNotes[0].owner_notes?.length, 2000);

    const missingLead = await fetch(`${origin}/action`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ lead_id: crypto.randomUUID(), status: "applied" }),
    });
    assertEquals(missingLead.status, 404);

    const missingJob = await fetch(`${origin}/jobs/requeue`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ job_id: crypto.randomUUID() }),
    });
    assertEquals(missingJob.status, 404);

    const pendingRows = await sql<Array<{ id: string }>>`
      insert into jobs (type, idempotency_key, payload)
      values (
        'discord_source_alert',
        ${`dashboard-api-test-${crypto.randomUUID()}`},
        ${sql.json({ title: "dashboard api test", message: "pending job" })}
      )
      returning id
    `;
    const pendingJobId = pendingRows[0].id;
    insertedJobIds.push(pendingJobId);

    const requeuePending = await fetch(`${origin}/jobs/requeue`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ job_id: pendingJobId }),
    });
    assertEquals(requeuePending.status, 409);

    const acknowledgePending = await fetch(`${origin}/jobs/acknowledge`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ job_id: pendingJobId }),
    });
    assertEquals(acknowledgePending.status, 409);
  } finally {
    child.kill("SIGTERM");
    await child.status;
    for (const jobId of insertedJobIds) {
      await sql`delete from jobs where id = ${jobId}::uuid`;
    }
    for (const leadId of insertedLeadIds) {
      await sql`delete from leads where id = ${leadId}::uuid`;
    }
    await sql.end();
  }
});
