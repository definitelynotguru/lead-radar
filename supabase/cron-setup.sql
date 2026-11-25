-- lead-radar cron setup. Run in the Supabase SQL editor after deploying functions.
-- Existing Vault secrets and cron jobs are left untouched, so rotate them explicitly if they change.
-- Replace __PROJECT_REF__, __INGEST_SECRET__, and __CANARY_SECRET__ first, or use scripts/provision-wizard.sh.
-- Supabase documents that decrypted Vault secrets can be visible in pg_net request rows while queued;
-- that tradeoff is documented in the README threat model.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select vault.create_secret('__INGEST_SECRET__', 'lead-radar-ingest-secret', 'shared secret for lead-radar ingest cron')
where not exists (select 1 from vault.secrets where name = 'lead-radar-ingest-secret');
select vault.create_secret('__CANARY_SECRET__', 'lead-radar-canary-secret', 'shared secret for lead-radar canary cron')
where not exists (select 1 from vault.secrets where name = 'lead-radar-canary-secret');

select cron.schedule(
  'lead-radar-ingest-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://__PROJECT_REF__.supabase.co/functions/v1/ingest-tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-lead-radar-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead-radar-ingest-secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'lead-radar-ingest-tick');

select cron.schedule(
  'lead-radar-canary',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://__PROJECT_REF__.supabase.co/functions/v1/canary',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-lead-radar-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead-radar-canary-secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
)
where not exists (select 1 from cron.job where jobname = 'lead-radar-canary');

select cron.schedule(
  'lead-radar-cron-log-cleanup',
  '17 3 * * *',
  $$
  delete from cron.job_run_details
  where end_time < now() - interval '7 days';
  $$
)
where not exists (select 1 from cron.job where jobname = 'lead-radar-cron-log-cleanup');
