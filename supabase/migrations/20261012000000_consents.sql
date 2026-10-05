-- Phase 6: consent (D79, D80; docs/consent-draft.md, approved by Sabine on
-- 4 October 2026). Each person agrees once, after their first sign-in and
-- before anything else, to two separate statements: the use of their data,
-- and its storage in the United States. The agreement is kept with the
-- text's version and time. Nothing is uploaded and no upload token is made
-- before it. Withdrawing deletes everything, as Delete my data does, and
-- keeps the record of the agreement and its withdrawal. A new version of the
-- text asks everyone again.

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version >= 1),
  agreed_use boolean not null check (agreed_use),
  agreed_us_storage boolean not null check (agreed_us_storage),
  agreed_at timestamptz not null default now(),
  -- When and why the agreement ended: withdrawn, or replaced by agreeing to
  -- a newer version of the text.
  ended_at timestamptz,
  ended_why text check (ended_why in ('withdrawn', 'new_version')),
  check ((ended_at is null) = (ended_why is null)),
  check (ended_at is null or ended_at >= agreed_at)
);

-- At most one agreement in force per person.
create unique index consents_in_force on public.consents (user_id) where ended_at is null;

alter table public.consents enable row level security;
create policy "people read their own consent" on public.consents
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;

-- The version of the consent text everyone must have agreed to; the app's
-- wording.consent.version. Raising it asks everyone again.
create function public.consent_version()
returns integer
language sql
immutable
set search_path = ''
as $$ select 1 $$;

revoke all on function public.consent_version() from public, anon;
grant execute on function public.consent_version() to authenticated, service_role;

create function public.has_consent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.consents
                  where user_id = p_user and ended_at is null and version >= public.consent_version());
$$;

revoke all on function public.has_consent(uuid) from public, anon, authenticated;
grant execute on function public.has_consent(uuid) to service_role;

-- Agreeing: both statements, to the current text. Agreeing again to the
-- same version changes nothing; agreeing to a newer one replaces the old.
create function public.give_consent(p_version integer, p_use boolean, p_us_storage boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_at timestamptz;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_use is not true or p_us_storage is not true then
    raise exception 'both agreements are needed' using errcode = '22023';
  end if;
  if p_version is null or p_version < public.consent_version() then
    raise exception 'that consent text is out of date' using errcode = '22023';
  end if;
  select agreed_at into v_at from public.consents
   where user_id = v_user and ended_at is null and version >= p_version;
  if found then
    return v_at;
  end if;
  update public.consents set ended_at = now(), ended_why = 'new_version'
   where user_id = v_user and ended_at is null;
  insert into public.consents (user_id, version, agreed_use, agreed_us_storage)
  values (v_user, p_version, true, true)
  returning agreed_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.give_consent(integer, boolean, boolean) from public, anon;
grant execute on function public.give_consent(integer, boolean, boolean) to authenticated;

-- Withdrawing (D80): server only, called by account-withdraw-consent after
-- it has checked the person's password. Deletes everything, as Delete my
-- data does, then ends the agreement.
create function public.withdraw_consent(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_user is null then
    raise exception 'no user' using errcode = '22023';
  end if;
  v_rows := public.delete_my_data(p_user);
  update public.consents set ended_at = now(), ended_why = 'withdrawn'
   where user_id = p_user and ended_at is null;
  return v_rows;
end;
$$;

revoke all on function public.withdraw_consent(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_consent(uuid) to service_role;

-- Delete my data keeps the consent record (D79): it holds no health data,
-- and the account stays.
create or replace function public.delete_my_data(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_rows integer;
  v_total integer := 0;
begin
  if p_user is null then
    raise exception 'no user' using errcode = '22023';
  end if;
  for v_table in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
       and c.table_name not in ('profiles', 'consents')
     order by c.table_name
  loop
    execute format('delete from public.%I where user_id = $1', v_table) using p_user;
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  -- The account stays; its time zone comes back with the next sync.
  update public.profiles set latest_tz_offset_min = null where user_id = p_user;
  return v_total;
end;
$$;

-- Uploads are refused without consent.
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
