import { assertEquals } from "jsr:@std/assert@1";

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

    const missingJob = await fetch(`${origin}/jobs/requeue`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ job_id: crypto.randomUUID() }),
    });
    assertEquals(missingJob.status, 409);
  } finally {
    child.kill("SIGTERM");
    await child.status;
  }
});
