import type { ApplicationStatus, DashboardSnapshot } from "../types";

export function normalizeDashboardApiUrl(apiUrl: string): string {
  const normalized = apiUrl.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return normalized;
  }
}

async function fetchDashboardApi(
  apiUrl: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return await fetch(`${normalizeDashboardApiUrl(apiUrl)}${path}`, init);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchSnapshot(
  apiUrl: string,
  token: string,
): Promise<DashboardSnapshot> {
  const response = await fetchDashboardApi(apiUrl, "/snapshot", {
    headers: { authorization: `Bearer ${token}` },
  });
  return await parseResponse<DashboardSnapshot>(response);
}

export async function postLeadAction(
  apiUrl: string,
  token: string,
  leadId: string,
  status: ApplicationStatus,
): Promise<void> {
  const response = await fetchDashboardApi(apiUrl, "/action", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ lead_id: leadId, status }),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function requeueProblemJob(
  apiUrl: string,
  token: string,
  jobId: string,
): Promise<void> {
  const response = await fetchDashboardApi(apiUrl, "/jobs/requeue", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ job_id: jobId, reset_attempts: true }),
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function acknowledgeProblemJob(
  apiUrl: string,
  token: string,
  jobId: string,
): Promise<void> {
  const response = await fetchDashboardApi(apiUrl, "/jobs/acknowledge", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ job_id: jobId }),
  });
  await parseResponse<{ ok: boolean }>(response);
}
