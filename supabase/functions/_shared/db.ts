import postgres from "npm:postgres@3.4.5";
import type { RuntimeEnv } from "./types.ts";

export type Sql = ReturnType<typeof postgres>;
export type PostgresJsonValue = Parameters<Sql["json"]>[0];

export function asPostgresJson(value: unknown): PostgresJsonValue {
  return value as PostgresJsonValue;
}

export function createDatabase(databaseUrl: string): Sql {
  const local = /(^|\/\/)[^/@]*@?(localhost|127\.0\.0\.1)(:|\/|$)/.test(databaseUrl) ||
    databaseUrl.includes("host.docker.internal");
  return postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    ssl: local ? false : "require",
  });
}

export function readRuntimeEnv(): RuntimeEnv {
  return {
    databaseUrl: Deno.env.get("LEAD_RADAR_DATABASE_URL") ?? Deno.env.get("SUPABASE_DB_URL") ?? "",
    discordWebhookUrl: Deno.env.get("DISCORD_WEBHOOK_URL") ?? undefined,
    githubToken: Deno.env.get("GITHUB_TOKEN") ?? undefined,
    ingestSecret: Deno.env.get("INGEST_SHARED_SECRET") ?? undefined,
    canarySecret: Deno.env.get("CANARY_SHARED_SECRET") ?? Deno.env.get("INGEST_SHARED_SECRET") ?? undefined,
    dashboardAccessToken: Deno.env.get("DASHBOARD_ACCESS_TOKEN") ?? undefined,
    healthchecksPingUrl: Deno.env.get("HEALTHCHECKS_PING_URL") ?? undefined,
    healthchecksCanaryPingUrl: Deno.env.get("HEALTHCHECKS_CANARY_PING_URL") ?? undefined,
  };
}
