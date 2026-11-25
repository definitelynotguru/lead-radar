import { compactWhitespace, truncate } from "./html.ts";
import type { JobRow, JsonObject } from "./types.ts";

export type DiscordSendResult = {
  outcome: "success" | "retryable_failure" | "permanent_failure" | "ambiguous";
  error?: string;
  responseStatus?: number;
  retryAfterSeconds?: number;
};

const SOURCE_COLORS: Record<string, number> = {
  hn: 0xff6600,
  github: 0x6e5494,
  remotive: 0x2f80ed,
};

function stringField(payload: JsonObject, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function buildDiscordMessage(job: JobRow): Record<string, unknown> {
  if (job.type === "discord_lead_alert") {
    const source = stringField(job.payload, "source") ?? "unknown";
    const fields = [
      ["Source", source],
      ["Company", stringField(job.payload, "company")],
      ["Location", stringField(job.payload, "location")],
      ["Compensation", stringField(job.payload, "salary")],
      ["Posted", stringField(job.payload, "posted_at")],
    ]
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([name, value]) => ({ name, value: truncate(value, 180), inline: true }));

    return {
      username: "lead-radar",
      embeds: [{
        title: truncate(stringField(job.payload, "title") ?? "New lead", 240),
        url: stringField(job.payload, "canonical_url"),
        description: truncate(
          stringField(job.payload, "description_snippet") ?? "Open the source post for details.",
          500,
        ),
        color: SOURCE_COLORS[source] ?? 0x5865f2,
        fields,
        footer: { text: `lead-radar • ${job.idempotency_key}` },
      }],
    };
  }

  const title = stringField(job.payload, "title") ?? "lead-radar alert";
  const message = stringField(job.payload, "message") ?? "A lead-radar operational check needs attention.";
  const source = stringField(job.payload, "source");
  return {
    username: "lead-radar",
    embeds: [{
      title: truncate(title, 240),
      description: truncate(message, 900),
      color: job.type === "discord_canary_alert" ? 0xed4245 : 0xfaa61a,
      fields: source ? [{ name: "Source", value: source, inline: true }] : [],
      footer: { text: `lead-radar • ${job.idempotency_key}` },
    }],
  };
}

function positiveNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  message: Record<string, unknown>,
): Promise<DiscordSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });

    if (response.status >= 200 && response.status < 300) {
      return { outcome: "success", responseStatus: response.status };
    }

    let retryAfterSeconds = positiveNumber(response.headers.get("retry-after"));
    if (response.status === 429 && retryAfterSeconds === undefined) {
      try {
        const body = await response.clone().json() as { retry_after?: number };
        if (typeof body.retry_after === "number") retryAfterSeconds = body.retry_after;
      } catch {
        // Discord rate-limit responses are usually JSON, but a malformed body does not change classification.
      }
    }

    if (response.status === 429 || response.status >= 500) {
      return {
        outcome: "retryable_failure",
        responseStatus: response.status,
        retryAfterSeconds,
        error: `Discord returned HTTP ${response.status}`,
      };
    }

    return {
      outcome: "permanent_failure",
      responseStatus: response.status,
      error: `Discord returned HTTP ${response.status}`,
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      outcome: "ambiguous",
      error: timedOut ? "Discord request timed out before a response" : "Discord request failed before a response",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeDiscordJob(job: JobRow, webhookUrl: string | undefined): Promise<DiscordSendResult> {
  if (!webhookUrl) {
    return {
      outcome: "retryable_failure",
      error: "DISCORD_WEBHOOK_URL is not configured",
    };
  }
  return await sendDiscordWebhook(webhookUrl, buildDiscordMessage(job));
}

export function summarizeForDiscord(input: string): string {
  return truncate(compactWhitespace(input), 450);
}
