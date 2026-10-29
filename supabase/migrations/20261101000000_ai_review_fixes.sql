-- 7b-7 code review of Phase 7b: three small fixes to the AI queue, none of them
-- changing what anyone sees or any status.
--
-- 1. A job stuck "running" (the writer died before it could report) was claimed
--    again every two minutes for ever, each time asking the model. The third
--    try is now the last: a job stuck through it is given up on.
-- 2. The two triggers that queue a text ran inside the insert of a day's status
--    (and of a digest). If the queue or the call to start the writer ever
--    failed, the status itself would fail to save. The AI only explains the
--    status, so a failure in the queue is now swallowed, and the status saves.
-- 3. A text saved after the person deleted their data (or withdrew) while the
--    model was still writing would have brought a row back. A text is now kept
--    only while its job still exists.

-- 1 ---------------------------------------------------------------------
create or replace function public.ai_claim_jobs(p_limit integer)
returns table (user_id uuid, kind text, for_date date)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.ai_jobs j
     set status = 'failed', finished_at = now(), last_error = 'timeout'
   where j.status = 'running' and j.started_at < now() - interval '2 minutes' and j.attempts >= 3;

  return query
  with picked as (
    select j.user_id, j.kind, j.for_date from public.ai_jobs j
     where j.status = 'pending' or (j.status = 'running' and j.started_at < now() - interval '2 minutes')
     order by j.created_at
     limit greatest(1, p_limit)
       for update skip locked
  )
  update public.ai_jobs j
     set status = 'running', attempts = j.attempts + 1, started_at = now()
    from picked
   where j.user_id = picked.user_id and j.kind = picked.kind and j.for_date = picked.for_date
  returning j.user_id, j.kind, j.for_date;
end;
$$;

-- Start the writer only when a job is waiting that it may still take.
create or replace function public.ai_start()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_url text;
begin
  if not exists (select 1 from public.ai_jobs
                  where status = 'pending'
                     or (status = 'running' and started_at < now() - interval '2 minutes' and attempts < 3)) then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'clarivi_cron_key';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'clarivi_functions_url';
  if v_key is null or v_url is null then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/ai-explain',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clarivi-cron', v_key),
    body := '{"kind": "run"}'::jsonb,
    timeout_milliseconds := 120000);
end;
$$;

-- 2 ---------------------------------------------------------------------
create or replace function public.ai_on_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status in ('ready', 'ease_off', 'rest') and new.date >= (now() at time zone 'utc')::date - 2 then
      if public.ai_enqueue(new.user_id, 'morning', new.date) then
        perform public.ai_start();
      end if;
    end if;
  exception when others then
    -- The status matters more than its explanation; the every-minute job picks the day up.
    raise warning 'ai queue: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

create or replace function public.ai_on_digest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if public.ai_enqueue(new.user_id, 'digest', new.week_start) then
      perform public.ai_start();
    end if;
  exception when others then
    raise warning 'ai queue: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

-- 3 ---------------------------------------------------------------------
create or replace function public.ai_save(p_user uuid, p_kind text, p_date date, p_body jsonb, p_model text, p_instruction text,
                                          p_hash text, p_status text, p_nudge text, p_tries integer, p_latency_ms integer,
                                          p_input_tokens integer, p_output_tokens integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Delete my data and Withdraw consent remove the job; a text written meanwhile is dropped.
  if not exists (select 1 from public.ai_jobs where user_id = p_user and kind = p_kind and for_date = p_date) then
    return;
  end if;
  insert into public.ai_texts (user_id, kind, for_date, body, model, instruction_version, input_hash, status, nudge,
                               tries, latency_ms, input_tokens, output_tokens)
  values (p_user, p_kind, p_date, p_body, p_model, p_instruction, p_hash, p_status, p_nudge, p_tries, p_latency_ms,
          p_input_tokens, p_output_tokens)
  on conflict (user_id, kind, for_date) do update
    set body = excluded.body, model = excluded.model, instruction_version = excluded.instruction_version,
        input_hash = excluded.input_hash, status = excluded.status, nudge = excluded.nudge, tries = excluded.tries,
        latency_ms = excluded.latency_ms, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
        created_at = now();
  update public.ai_jobs set status = 'done', finished_at = now(), last_error = null
   where user_id = p_user and kind = p_kind and for_date = p_date;
end;
$$;
