-- Hardening for databases that already applied the initial schema.
-- Fresh installs apply the base migration first, then these replacements.

alter table leads enable row level security;
alter table applications enable row level security;
alter table outcomes enable row level security;
alter table source_states enable row level security;
alter table fetch_runs enable row level security;
alter table jobs enable row level security;
alter table job_attempts enable row level security;
alter table dead_letters enable row level security;
alter table canary_runs enable row level security;

do $$
declare
  v_table_name text;
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      foreach v_table_name in array array[
        'leads',
        'applications',
        'outcomes',
        'source_states',
        'fetch_runs',
        'jobs',
        'job_attempts',
        'dead_letters',
        'canary_runs'
      ] loop
        execute format('revoke all on table public.%I from %I', v_table_name, v_role);
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function mark_expired_claims_ambiguous(p_reason text default 'worker lease expired before completion')
returns integer
language plpgsql
as $$
declare
  v_job jobs%rowtype;
  v_attempt_number integer;
  v_count integer := 0;
begin
  for v_job in
    select *
    from jobs
    where status = 'claimed'
      and lease_expires_at < now()
    for update skip locked
  loop
    select coalesce(max(attempt_number), 0) + 1
    into v_attempt_number
    from job_attempts
    where job_id = v_job.id;

    insert into job_attempts (
      job_id,
      attempt_number,
      status,
      error,
      worker_id
    ) values (
      v_job.id,
      v_attempt_number,
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
  v_attempt_number integer;
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

  select coalesce(max(attempt_number), 0) + 1
  into v_attempt_number
  from job_attempts
  where job_id = p_job_id;

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
    v_attempt_number,
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
    and status in ('failed', 'ambiguous', 'dead_lettered')
  returning * into v_result;

  if not found then
    raise exception 'job % is not requeueable', p_job_id;
  end if;

  delete from dead_letters
  where job_id = p_job_id;

  return v_result;
end;
$$;

create or replace function acknowledge_ambiguous_job(p_job_id uuid)
returns jobs
language plpgsql
as $$
declare
  v_result jobs%rowtype;
begin
  update jobs
  set status = 'cancelled',
      leased_at = null,
      lease_expires_at = null,
      lease_owner = null,
      last_error = null,
      completed_at = now()
  where id = p_job_id
    and status = 'ambiguous'
  returning * into v_result;

  if not found then
    raise exception 'job % is not ambiguous', p_job_id;
  end if;

  return v_result;
end;
$$;
