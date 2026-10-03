-- Phase 1 code review fixes (3 October 2026).
--
-- 1. Signed-in users keep only SELECT on the Phase 1a tables. The 1a
--    migration revoked insert, update and delete but left TRUNCATE, TRIGGER
--    and REFERENCES, and TRUNCATE ignores row-level security.
-- 2. Import progress counts a month only once its last part has arrived.
--    The Shortcut now marks the month's last post with "month_complete":
--    true; before, a month counted as soon as any of its posts arrived, so
--    an import that stopped part-way could already say "12 of 12". The only
--    imports before this change are Sabine's, all 12 months of which were
--    checked complete on 3 October 2026, so existing import rows are marked
--    complete.
-- Everything else in ingest_upload is unchanged from
-- 20261003175000_set_aside_readings.sql.

revoke truncate, references, trigger on public.profiles, public.push_subscriptions from authenticated;

alter table public.uploads add column month_complete boolean not null default false;

update public.uploads set month_complete = true where kind = 'backfill' and status = 'accepted';

-- Stores one post from the Shortcut. Called only by the ingest server
-- function, with the SHA-256 hash of the upload token and a body it has
-- already checked against the schema (or the reason it rejected the body).
-- The user always comes from the token, never from the body.
--
-- The reply holds counts and flags only, never readings:
--   accepted                new readings stored
--   duplicates              readings that were already stored
--   night_complete          last night's sleep has arrived and its last
--                           asleep reading ended at least 10 minutes ago
--                           (starting rule for Phase 1b; Phase 2 builds the
--                           full rule)
--   already_complete_today  an earlier post today had already completed the
--                           night, so the Shortcut can stop after its ping
--   months_imported         backfill only: months of the import window whose
--                           last part has arrived (this month and the 11
--                           before it)
-- or {error} with invalid_token, token_revoked, rate_limited or invalid_body.
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
  -- an hour, and 60 an hour for everything else, rejected posts included.
  if p_upload ->> 'kind' = 'backfill' then
    if (select count(*) from public.uploads
         where token_id = v_token.id and kind = 'backfill'
           and received_at > now() - interval '1 hour') >= 200 then
      return jsonb_build_object('error', 'rate_limited');
    end if;
  elsif (select count(*) from public.uploads
          where token_id = v_token.id and kind is distinct from 'backfill'
            and received_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if v_token.revoked_at is not null then
    insert into public.uploads (user_id, token_id, status, error)
    values (v_token.user_id, v_token.id, 'rejected', 'token_revoked');
    return jsonb_build_object('error', 'token_revoked');
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
  if p_upload ->> 'kind' = 'daily' then
    v_midnight := (v_local_date::timestamp - make_interval(mins => v_offset)) at time zone 'utc';
    select max(end_at) into v_last_asleep
      from public.samples
     where user_id = v_token.user_id
       and type = 'sleep_stage'
       and stage in ('asleep', 'core', 'deep', 'rem')
       and end_at >= v_midnight
       and end_at < v_midnight + interval '12 hours';
    v_complete := v_last_asleep is not null and v_last_asleep <= now() - interval '10 minutes';
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
