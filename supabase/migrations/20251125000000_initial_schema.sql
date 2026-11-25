create extension if not exists pgcrypto;

create type lead_source as enum ('hn', 'github', 'remotive');
create type job_status as enum (
  'pending',
  'claimed',
  'succeeded',
  'failed',
  'ambiguous',
  'dead_lettered',
  'cancelled'
);
create type application_status as enum (
  'applied',
  'ignored',
  'replied',
  'rejected',
  'interview',
  'offer',
  'closed'
);
create type outcome_type as enum (
  'applied',
  'ignored',
  'replied',
  'rejected',
  'interview',
  'offer',
  'closed',
  'no_response',
  'note'
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  source lead_source not null,
  external_id text not null,
  canonical_url text not null,
  title text not null,
  company text,
  location text,
  salary text,
  description text not null default '',
  tags text[] not null default '{}',
  remote boolean,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  ingestion_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_source_external_id_key unique (source, external_id),
  constraint leads_external_id_nonempty check (length(external_id) > 0),
  constraint leads_title_nonempty check (length(title) > 0)
);

create index leads_source_first_seen_idx on leads (source, first_seen_at desc);
create index leads_posted_at_idx on leads (posted_at desc) where posted_at is not null;
create index leads_metadata_gin_idx on leads using gin (metadata);

create table applications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  status application_status not null,
  applied_at timestamptz,
  owner_notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_lead_id_key unique (lead_id)
);

create index applications_status_idx on applications (status, updated_at desc);

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  kind outcome_type not null,
  occurred_at timestamptz not null default now(),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index outcomes_application_time_idx on outcomes (application_id, occurred_at desc);
create index outcomes_kind_time_idx on outcomes (kind, occurred_at desc);

create table source_states (
  source lead_source primary key,
  enabled boolean not null default true,
  cadence_seconds integer not null check (cadence_seconds >= 60),
  cursor jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_item_seen_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into source_states (source, cadence_seconds) values
  ('hn', 60),
  ('github', 60),
  ('remotive', 21600)
on conflict (source) do nothing;

create table fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source lead_source not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('success', 'partial', 'error', 'skipped')),
  http_status integer,
  item_count integer not null default 0 check (item_count >= 0),
  new_lead_count integer not null default 0 check (new_lead_count >= 0),
  duration_ms integer check (duration_ms >= 0),
  error_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index fetch_runs_source_started_idx on fetch_runs (source, started_at desc);
create index fetch_runs_status_idx on fetch_runs (status, started_at desc);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('discord_lead_alert', 'discord_source_alert', 'discord_canary_alert')),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status job_status not null default 'pending',
  priority integer not null default 0,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  run_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  lease_owner text,
  last_error text,
  last_response_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint jobs_idempotency_key_key unique (idempotency_key),
  constraint jobs_idempotency_key_nonempty check (length(idempotency_key) > 0)
);

create index jobs_due_idx on jobs (run_at, priority desc, created_at)
  where status in ('pending', 'failed');
create index jobs_status_idx on jobs (status, updated_at desc);
create index jobs_lease_idx on jobs (lease_expires_at)
  where status = 'claimed';

create table job_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  status text not null check (status in ('success', 'retryable_failure', 'permanent_failure', 'ambiguous')),
  error text,
  response_status integer,
  duration_ms integer check (duration_ms >= 0),
  worker_id text,
  created_at timestamptz not null default now(),
  constraint job_attempts_job_attempt_key unique (job_id, attempt_number)
);

create index job_attempts_job_idx on job_attempts (job_id, started_at desc);

create table dead_letters (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id) on delete cascade,
  type text not null,
  idempotency_key text not null unique,
  payload jsonb not null,
  attempts integer not null,
  reason text not null,
  last_response_status integer,
  dead_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index dead_letters_dead_at_idx on dead_letters (dead_at desc);

create table canary_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('success', 'failure')),
  checks jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index canary_runs_started_idx on canary_runs (started_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_set_updated_at before update on leads
for each row execute function set_updated_at();
create trigger applications_set_updated_at before update on applications
for each row execute function set_updated_at();
create trigger source_states_set_updated_at before update on source_states
for each row execute function set_updated_at();
create trigger jobs_set_updated_at before update on jobs
for each row execute function set_updated_at();

create or replace function ingest_leads_batch(p_source lead_source, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  v_lead_id uuid;
  v_inserted integer := 0;
  v_duplicate integer := 0;
  v_lead_ids jsonb := '[]'::jsonb;
  v_tags text[];
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'ingest_leads_batch expects a JSON array';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item->'tags') = 'array' then
      select coalesce(array_agg(value), '{}'::text[])
        into v_tags
        from jsonb_array_elements_text(item->'tags') as tags(value);
    else
      v_tags := '{}'::text[];
    end if;

    insert into leads (
      source,
      external_id,
      canonical_url,
      title,
      company,
      location,
      salary,
      description,
      tags,
      remote,
      posted_at,
      metadata,
      ingestion_hash
    ) values (
      p_source,
      item->>'external_id',
      item->>'canonical_url',
      item->>'title',
      nullif(item->>'company', ''),
      nullif(item->>'location', ''),
      nullif(item->>'salary', ''),
      left(coalesce(item->>'description', ''), 20000),
      v_tags,
      case when item ? 'remote' then (item->>'remote')::boolean else null end,
      nullif(item->>'posted_at', '')::timestamptz,
      coalesce(item->'metadata', '{}'::jsonb) || jsonb_build_object('ingested_by', 'lead-radar'),
      coalesce(nullif(item->>'ingestion_hash', ''), encode(digest(p_source::text || ':' || (item->>'external_id'), 'sha256'), 'hex'))
    )
    on conflict (source, external_id) do nothing
    returning id into v_lead_id;

    if v_lead_id is null then
      update leads
      set last_seen_at = now()
      where source = p_source
        and external_id = item->>'external_id';
      v_duplicate := v_duplicate + 1;
    else
      insert into jobs (
        type,
        idempotency_key,
        payload,
        priority,
        max_attempts,
        run_at
      ) values (
        'discord_lead_alert',
        'lead-alert:' || p_source::text || ':' || (item->>'external_id'),
        jsonb_build_object(
          'lead_id', v_lead_id,
          'source', p_source::text,
          'external_id', item->>'external_id',
          'title', item->>'title',
          'canonical_url', item->>'canonical_url',
          'company', nullif(item->>'company', ''),
          'location', nullif(item->>'location', ''),
          'salary', nullif(item->>'salary', ''),
          'posted_at', nullif(item->>'posted_at', ''),
          'description_snippet', left(coalesce(item->>'description', ''), 500),
          'tags', coalesce(item->'tags', '[]'::jsonb)
        ),
        100,
        5,
        now()
      )
      on conflict (idempotency_key) do nothing;

      v_inserted := v_inserted + 1;
      v_lead_ids := v_lead_ids || jsonb_build_array(v_lead_id);
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'duplicates', v_duplicate,
    'lead_ids', v_lead_ids
  );
end;
$$;

create or replace function begin_fetch_run(p_source lead_source)
returns uuid
language plpgsql
as $$
declare
  v_run_id uuid;
begin
  insert into fetch_runs (source)
  values (p_source)
  returning id into v_run_id;

  update source_states
  set last_run_at = now()
  where source = p_source;

  return v_run_id;
end;
$$;

create or replace function finalize_fetch_run(
  p_fetch_run_id uuid,
  p_source lead_source,
  p_status text,
  p_http_status integer,
  p_item_count integer,
  p_new_lead_count integer,
  p_error_message text,
  p_details jsonb,
  p_cursor jsonb,
  p_last_item_seen_at timestamptz
)
returns void
language plpgsql
as $$
begin
  update fetch_runs
  set finished_at = now(),
      status = p_status,
      http_status = p_http_status,
      item_count = coalesce(p_item_count, 0),
      new_lead_count = coalesce(p_new_lead_count, 0),
      duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer),
      error_message = nullif(p_error_message, ''),
      details = coalesce(p_details, '{}'::jsonb)
  where id = p_fetch_run_id;

  update source_states
  set cursor = coalesce(p_cursor, source_states.cursor),
      last_success_at = case when p_status in ('success', 'partial') then now() else last_success_at end,
      last_error_at = case when p_status = 'error' then now() else last_error_at end,
      last_item_seen_at = case
        when p_last_item_seen_at is null then last_item_seen_at
        when last_item_seen_at is null then p_last_item_seen_at
        else greatest(last_item_seen_at, p_last_item_seen_at)
      end,
      consecutive_failures = case when p_status = 'error' then consecutive_failures + 1 else 0 end,
      last_error = case when p_status = 'error' then nullif(p_error_message, '') else null end
  where source = p_source;
end;
$$;

create or replace function mark_expired_claims_ambiguous(p_reason text default 'worker lease expired before completion')
returns integer
language plpgsql
as $$
declare
  v_job jobs%rowtype;
  v_count integer := 0;
begin
  for v_job in
    select *
    from jobs
    where status = 'claimed'
      and lease_expires_at < now()
    for update skip locked
  loop
    insert into job_attempts (
      job_id,
      attempt_number,
      status,
      error,
      worker_id
    ) values (
      v_job.id,
      v_job.attempts,
      'ambiguous',
      p_reason,
      v_job.lease_owner
    )
    on conflict (job_id, attempt_number) do nothing;

    update jobs
    set status = 'ambiguous',
        leased_at = null,
        lease_expires_at = null,
        lease_owner = null,
        last_error = p_reason
    where id = v_job.id
      and status = 'claimed';

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function claim_due_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns setof jobs
language plpgsql
as $$
begin
  return query
  with due as (
    select id
    from jobs
    where status in ('pending', 'failed')
      and run_at <= now()
    order by priority desc, run_at asc, created_at asc
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update jobs as j
  set status = 'claimed',
      attempts = j.attempts + 1,
      leased_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      lease_owner = p_worker_id
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

create or replace function complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_outcome text,
  p_error text,
  p_response_status integer,
  p_duration_ms integer,
  p_next_run_at timestamptz
)
returns jobs
language plpgsql
as $$
declare
  v_job jobs%rowtype;
  v_result jobs%rowtype;
  v_final_status job_status;
  v_reason text;
begin
  if p_outcome not in ('success', 'retryable_failure', 'permanent_failure', 'ambiguous') then
    raise exception 'invalid job outcome: %', p_outcome;
  end if;

  select * into v_job
  from jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'job not found: %', p_job_id;
  end if;

  if v_job.status <> 'claimed' or v_job.lease_owner is distinct from p_worker_id then
    raise exception 'job % is not claimed by worker %', p_job_id, p_worker_id;
  end if;

  insert into job_attempts (
    job_id,
    attempt_number,
    status,
    error,
    response_status,
    duration_ms,
    worker_id
  ) values (
    p_job_id,
    v_job.attempts,
    p_outcome,
    nullif(p_error, ''),
    p_response_status,
    p_duration_ms,
    p_worker_id
  )
  on conflict (job_id, attempt_number) do nothing;

  if p_outcome = 'success' then
    v_final_status := 'succeeded';
  elsif p_outcome = 'ambiguous' then
    v_final_status := 'ambiguous';
  elsif p_outcome = 'permanent_failure' or v_job.attempts >= v_job.max_attempts then
    v_final_status := 'dead_lettered';
  else
    v_final_status := 'failed';
  end if;

  v_reason := coalesce(nullif(p_error, ''), 'job exhausted retry budget');

  update jobs
  set status = v_final_status,
      run_at = case
        when v_final_status = 'failed' then coalesce(p_next_run_at, now() + interval '1 minute')
        else run_at
      end,
      leased_at = null,
      lease_expires_at = null,
      lease_owner = null,
      last_error = case when v_final_status in ('failed', 'ambiguous', 'dead_lettered') then nullif(p_error, '') else null end,
      last_response_status = p_response_status,
      completed_at = case when v_final_status in ('succeeded', 'dead_lettered') then now() else completed_at end
  where id = p_job_id
  returning * into v_result;

  if v_final_status = 'dead_lettered' then
    insert into dead_letters (
      job_id,
      type,
      idempotency_key,
      payload,
      attempts,
      reason,
      last_response_status
    ) values (
      v_job.id,
      v_job.type,
      v_job.idempotency_key,
      v_job.payload,
      v_job.attempts,
      v_reason,
      p_response_status
    )
    on conflict (job_id) do nothing;
  end if;

  return v_result;
end;
$$;

create or replace function requeue_job(
  p_job_id uuid,
  p_delay_seconds integer default 0,
  p_reset_attempts boolean default true
)
returns jobs
language plpgsql
as $$
declare
  v_result jobs%rowtype;
begin
  update jobs
  set status = 'pending',
      attempts = case when p_reset_attempts then 0 else attempts end,
      run_at = now() + make_interval(secs => greatest(0, p_delay_seconds)),
      leased_at = null,
      lease_expires_at = null,
      lease_owner = null,
      last_error = null,
      completed_at = null
  where id = p_job_id
    and status in ('failed', 'ambiguous', 'dead_lettered', 'cancelled')
  returning * into v_result;

  if not found then
    raise exception 'job % is not requeueable', p_job_id;
  end if;

  return v_result;
end;
$$;

create or replace function upsert_application_outcome(
  p_lead_id uuid,
  p_status application_status,
  p_notes text,
  p_occurred_at timestamptz,
  p_is_demo boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_application_id uuid;
  v_outcome_id uuid;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  insert into applications (
    lead_id,
    status,
    applied_at,
    owner_notes,
    is_demo
  ) values (
    p_lead_id,
    p_status,
    case when p_status = 'applied' then v_occurred_at else null end,
    nullif(p_notes, ''),
    p_is_demo
  )
  on conflict (lead_id) do update
  set status = excluded.status,
      owner_notes = excluded.owner_notes,
      applied_at = case
        when excluded.status = 'applied' then coalesce(applications.applied_at, excluded.applied_at, now())
        else applications.applied_at
      end
  returning id into v_application_id;

  insert into outcomes (
    application_id,
    kind,
    occurred_at,
    notes,
    is_demo
  ) values (
    v_application_id,
    p_status::text::outcome_type,
    v_occurred_at,
    nullif(p_notes, ''),
    p_is_demo
  )
  returning id into v_outcome_id;

  return jsonb_build_object(
    'application_id', v_application_id,
    'outcome_id', v_outcome_id
  );
end;
$$;
