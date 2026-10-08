-- D86 (8 October 2026): a night is complete only when the Watch's own sleep
-- stages (core, deep, REM) have arrived, the same rule the night builder uses
-- (D10, D49). Until now a plain "asleep" record also completed it, so on
-- 8 October a stage-less record told the Shortcut the day was done (and later
-- syncs stopped) while the analysis built no night. No data changes: only
-- ingest_upload's check. Copied from 20261012000000_consents.sql with that one
-- change.

create or replace function public.ingest_upload(p_token_hash text, p_upload jsonb, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.upload_tokens%rowtype;
  v_offset integer;
  v_local_date date;
  v_midnight timestamptz;
  v_upload_id uuid;
  v_submitted integer;
  v_inserted integer;
  v_already boolean;
  v_complete boolean := false;
  v_last_asleep timestamptz;
  v_months integer;
begin
  select * into v_token from public.upload_tokens where token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  -- Rate limits per token (tech-spec section 6): 200 import (backfill) posts
  -- an hour, 200 pings an hour, and 60 an hour for everything else (daily
  -- posts and rejected posts), each counted separately.
  if p_upload ->> 'kind' in ('backfill', 'ping') then
    if (select count(*) from public.uploads
         where token_id = v_token.id and kind = p_upload ->> 'kind'
           and received_at > now() - interval '1 hour') >= 200 then
      return jsonb_build_object('error', 'rate_limited');
    end if;
  elsif (select count(*) from public.uploads
          where token_id = v_token.id and kind is distinct from 'backfill' and kind is distinct from 'ping'
            and received_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if v_token.revoked_at is not null then
    insert into public.uploads (user_id, token_id, status, error)
    values (v_token.user_id, v_token.id, 'rejected', 'token_revoked');
    return jsonb_build_object('error', 'token_revoked');
  end if;

  -- Nothing is accepted from someone who hasn't agreed to the current
  -- consent text (D79). The refusal is logged like other rejected posts.
  if not public.has_consent(v_token.user_id) then
    insert into public.uploads (user_id, token_id, status, error)
    values (v_token.user_id, v_token.id, 'rejected', 'no_consent');
    return jsonb_build_object('error', 'no_consent');
  end if;

  if p_error is not null then
    insert into public.uploads (user_id, token_id, status, error)
    values (v_token.user_id, v_token.id, 'rejected', left(p_error, 200));
    return jsonb_build_object('error', 'invalid_body');
  end if;

  v_offset := (p_upload ->> 'device_tz_offset_min')::integer;
  v_local_date := ((now() at time zone 'utc') + make_interval(mins => v_offset))::date;
  v_submitted := jsonb_array_length(coalesce(p_upload -> 'samples', '[]'::jsonb));

  select exists (
    select 1 from public.uploads
     where user_id = v_token.user_id and local_date = v_local_date
       and status = 'accepted' and night_complete
  ) into v_already;

  insert into public.uploads (user_id, token_id, schema_version, kind, month_id, run_trigger,
                              device_tz_offset_min, local_date, status, set_aside_count, set_aside_note,
                              month_complete)
  values (v_token.user_id, v_token.id, (p_upload ->> 'schema_version')::integer, p_upload ->> 'kind',
          p_upload ->> 'month_id', p_upload ->> 'trigger', v_offset, v_local_date, 'accepted',
          coalesce((p_upload ->> 'set_aside')::integer, 0), left(p_upload ->> 'set_aside_note', 300),
          p_upload ->> 'kind' = 'backfill' and coalesce((p_upload ->> 'month_complete')::boolean, false))
  returning id into v_upload_id;

  -- A reading is the same reading if its type, times, value, stage and source
  -- match. The time zone isn't part of it: the same moment posted from
  -- another time zone is still the same reading.
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, unit,
                              stage, source_name, source_device, sample_hash)
  select v_token.user_id, v_upload_id, s.type, s.start_at, s.end_at, s.tz_offset_min, s.value, s.unit,
         s.stage, s.source_name, s.source_device,
         sha256(convert_to(jsonb_build_array(s.type, extract(epoch from s.start_at), extract(epoch from s.end_at),
                                             s.value, s.stage, s.source_name)::text, 'UTF8'))
    from jsonb_to_recordset(coalesce(p_upload -> 'samples', '[]'::jsonb)) as s (
      type text, start_at timestamptz, end_at timestamptz, tz_offset_min integer, value double precision,
      unit text, stage text, source_name text, source_device text)
  on conflict (user_id, sample_hash) do nothing;
  get diagnostics v_inserted = row_count;

  -- Only a daily post can complete a night. An import never counts as
  -- today's sync, and a ping carries no readings.
  -- Only the Watch's own sleep stages complete it (D86): a plain "asleep"
  -- record has no stages, and the night builder never counts it (D10, D49).
  if p_upload ->> 'kind' = 'daily' then
    v_midnight := (v_local_date::timestamp - make_interval(mins => v_offset)) at time zone 'utc';
    select max(end_at) into v_last_asleep
      from public.samples
     where user_id = v_token.user_id
       and type = 'sleep_stage'
       and stage in ('core', 'deep', 'rem')
       and end_at >= v_midnight
       and end_at < v_midnight + interval '12 hours';
    v_complete := v_last_asleep is not null and v_last_asleep <= now() - interval '10 minutes';
  end if;

  -- Queue a recalculation for the dates the readings cover (run every
  -- minute by run_analysis_queue). A daily post always queues one, since a
  -- night can become finished without new readings; an import part only if
  -- it brought something new. Imports never ask for a notification.
  if p_upload ->> 'kind' = 'daily' or (p_upload ->> 'kind' = 'backfill' and v_inserted > 0) then
    insert into public.analysis_queue (user_id, from_date, to_date, reason, send_push)
    select v_token.user_id,
           coalesce(min((s.start_at at time zone 'utc')::date) - 1, v_local_date),
           greatest(coalesce(max((s.end_at at time zone 'utc')::date) + 1, v_local_date),
                    case when p_upload ->> 'kind' = 'daily' then v_local_date
                         else coalesce(min((s.start_at at time zone 'utc')::date) - 1, v_local_date) end),
           p_upload ->> 'kind',
           p_upload ->> 'kind' = 'daily'
      from jsonb_to_recordset(coalesce(p_upload -> 'samples', '[]'::jsonb)) as s (start_at timestamptz, end_at timestamptz);
  end if;

  update public.uploads
     set sample_count = v_submitted,
         duplicate_count = v_submitted - v_inserted,
         night_complete = v_complete
   where id = v_upload_id;

  if p_upload ->> 'kind' = 'backfill' then
    select count(distinct month_id) into v_months
      from public.uploads
     where user_id = v_token.user_id
       and kind = 'backfill'
       and status = 'accepted'
       and month_complete
       and month_id between to_char(v_local_date - interval '11 months', 'YYYY-MM') and to_char(v_local_date, 'YYYY-MM');
  end if;

  update public.upload_tokens set last_used_at = now() where id = v_token.id;
  update public.profiles set latest_tz_offset_min = v_offset where user_id = v_token.user_id;

  return jsonb_build_object(
    'accepted', v_inserted,
    'duplicates', v_submitted - v_inserted,
    'night_complete', v_complete,
    'already_complete_today', v_already
  ) || case when v_months is null then '{}'::jsonb else jsonb_build_object('months_imported', v_months) end;
end;
$$;

revoke all on function public.ingest_upload(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.ingest_upload(text, jsonb, text) to service_role;
