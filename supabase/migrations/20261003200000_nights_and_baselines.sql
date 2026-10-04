-- Phase 2a: nights, normals (baselines) and the analysis queue
-- (docs/tech-spec.md, section 3; docs/progress.md, Phase 2; decisions D10,
-- D11, D19).
--
-- Raw readings are never changed. Everything here is rebuilt from them by
-- recompute(), so a rule change is a recompute, never a re-sync. Signed-in
-- users can read only their own nights and normals; nobody writes to these
-- tables directly.
--
-- Rules agreed by Sabine on 3 October 2026 (Phase 2a plan):
-- - A sleep is the Watch's asleep stages (core, deep, REM) joined wherever
--   the gaps are 90 minutes or less. Unspecified "asleep" and "in bed" are
--   left out: only the Watch writes stages, and Shortcuts gives sleep no
--   source (Phase 1b), so stages are how Watch sleep is recognised (D10).
-- - A night is the longest sleep that ends on a date (the local date of
--   waking), and it needs at least 2 hours asleep; shorter sleeps are naps
--   or tracking gaps.
-- - Sleeping heart rate is the median of the heart rate readings taken while
--   asleep, and needs at least 10 of them.
-- - A normal (baseline) is the median of the previous 28 nights (never the
--   night judged), with the scaled MAD (MAD x 1.4826) as the spread and a
--   normal range of 2 spreads either side; it is still building until 21 of
--   the 28 nights have the reading (D11).

-- Nights: one row per user per night, dated by the local date of waking.
create table public.nights (
  user_id uuid not null references auth.users (id) on delete cascade,
  night_date date not null,
  tz_offset_min integer not null,
  sleep_start timestamptz not null,
  sleep_end timestamptz not null,
  asleep_min numeric not null,
  finished boolean not null,
  sleeping_hr numeric,
  sleeping_hr_count integer not null,
  hrv_median numeric,
  hrv_count integer not null,
  resp_rate numeric,
  resp_count integer not null,
  resting_hr_prev_day numeric,
  -- Share of the asleep time (in 15-minute blocks) with a heart rate reading.
  coverage numeric not null check (coverage between 0 and 1),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  computed_at timestamptz not null default now(),
  primary key (user_id, night_date)
);

alter table public.nights enable row level security;

create policy "nights: read own"
  on public.nights for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.nights from anon, authenticated;
grant select on public.nights to authenticated;

-- Normals: one row per night and reading, from the 28 nights before it.
create table public.baselines (
  user_id uuid not null references auth.users (id) on delete cascade,
  night_date date not null,
  metric text not null check (metric in ('sleeping_hr', 'hrv', 'sleep', 'resp_rate', 'resting_hr')),
  median_28 numeric,
  mad_scaled numeric,
  valid_nights integer not null,
  range_low numeric,
  range_high numeric,
  building boolean not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, night_date, metric)
);

alter table public.baselines enable row level security;

create policy "baselines: read own"
  on public.baselines for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.baselines from anon, authenticated;
grant select on public.baselines to authenticated;

-- Analysis queue: work waiting for the analysis. Internal only: row-level
-- security is on and there is no policy, so the app can't see it.
create table public.analysis_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text not null check (reason in ('daily', 'backfill', 'manual')),
  send_push boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  queued_at timestamptz not null default now(),
  done_at timestamptz,
  error text,
  check (from_date <= to_date)
);

create index analysis_queue_pending_idx on public.analysis_queue (user_id, queued_at) where status = 'pending';

alter table public.analysis_queue enable row level security;
revoke all on public.analysis_queue from anon, authenticated;

-- Rebuilds one user's nights whose date of waking is between the two dates.
create function public.rebuild_nights(p_user uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_sync timestamptz;
  v_count integer;
begin
  delete from public.nights where user_id = p_user and night_date between p_from and p_to;

  select max(received_at) into v_last_sync
    from public.uploads where user_id = p_user and status = 'accepted';

  with seg as (
    -- Asleep stages that could belong to a night in range (two days of
    -- margin either side for long sleeps and time zones).
    select s.start_at, s.end_at, s.tz_offset_min
      from public.samples s
     where s.user_id = p_user and s.type = 'sleep_stage' and s.stage in ('core', 'deep', 'rem')
       and s.end_at >= (p_from - 2)::timestamp at time zone 'utc'
       and s.end_at < (p_to + 3)::timestamp at time zone 'utc'
       and s.start_at < (p_to + 2)::timestamp at time zone 'utc'
  ), ordered as (
    select seg.*, max(end_at) over (order by start_at, end_at rows between unbounded preceding and 1 preceding) as prev_end
      from seg
  ), numbered as (
    select ordered.*,
           sum(case when prev_end is null or start_at > prev_end + interval '90 minutes' then 1 else 0 end)
             over (order by start_at, end_at) as sleep_no
      from ordered
  ), sleeps as (
    select sleep_no, min(start_at) as sleep_start, max(end_at) as sleep_end,
           sum(extract(epoch from end_at - start_at)) / 60 as asleep_min,
           (array_agg(tz_offset_min order by end_at desc))[1] as tz_offset_min,
           array_agg(start_at order by start_at) as stage_starts,
           array_agg(end_at order by start_at) as stage_ends
      from numbered group by sleep_no
  ), dated as (
    select sleeps.*, ((sleep_end at time zone 'utc') + make_interval(mins => tz_offset_min))::date as night_date
      from sleeps
  ), chosen as (
    -- The longest sleep ending on each date, if it reaches 2 hours.
    select distinct on (night_date) *
      from dated
     where asleep_min >= 120 and night_date between p_from and p_to
     order by night_date, asleep_min desc, sleep_end desc
  )
  -- Each night's readings are looked up on their own, through the index on
  -- (user, type, end time), so a year takes about as long per night as a
  -- week. (Joining all nights' readings in one go was planned to repeat the
  -- work for every night: 23 seconds for a year.) No reading lasts more than
  -- a day (7 days for resting heart rate), which bounds each lookup.
  insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                             sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count,
                             resting_hr_prev_day, coverage, confidence)
  select p_user, c.night_date, c.tz_offset_min, c.sleep_start, c.sleep_end, round(c.asleep_min, 1),
         v_last_sync is not null and c.sleep_end <= v_last_sync - interval '10 minutes',
         case when hr.n >= 10 then hr.median end,
         hr.n,
         hrv.median, hrv.n,
         rr.median, rr.n,
         rhr.value,
         cov.coverage,
         case when cov.coverage >= 0.7 then 'high' when cov.coverage >= 0.4 then 'medium' else 'low' end
    from chosen c
    cross join lateral (
      -- Heart rate readings taken during one of the sleep's asleep stages.
      select count(*)::integer as n, count(distinct floor(extract(epoch from h.start_at) / 900)) as blocks,
             percentile_cont(0.5) within group (order by h.value) as median
        from public.samples h
       where h.user_id = p_user and h.type = 'heart_rate'
         and h.end_at >= c.sleep_start and h.end_at < c.sleep_end
         and exists (select 1 from unnest(c.stage_starts, c.stage_ends) as g (stage_start, stage_end)
                      where h.start_at >= g.stage_start and h.end_at < g.stage_end)
    ) hr
    cross join lateral (
      select least(1, hr.blocks / greatest(1, ceil(c.asleep_min / 15))) as coverage
    ) cov
    cross join lateral (
      select count(*)::integer as n, percentile_cont(0.5) within group (order by s.value) as median
        from public.samples s
       where s.user_id = p_user and s.type = 'hrv_sdnn'
         and s.end_at >= c.sleep_start and s.end_at <= c.sleep_end + interval '1 day'
         and s.start_at <= c.sleep_end
    ) hrv
    cross join lateral (
      select count(*)::integer as n, percentile_cont(0.5) within group (order by s.value) as median
        from public.samples s
       where s.user_id = p_user and s.type = 'respiratory_rate'
         and s.end_at >= c.sleep_start and s.end_at <= c.sleep_end + interval '1 day'
         and s.start_at <= c.sleep_end
    ) rr
    left join lateral (
      -- Apple's resting heart rate for the day before waking (none is fine).
      select s.value
        from public.samples s
       where s.user_id = p_user and s.type = 'resting_hr'
         and s.end_at >= (c.night_date - 2)::timestamp at time zone 'utc'
         and s.end_at < (c.night_date + 9)::timestamp at time zone 'utc'
         and ((s.start_at at time zone 'utc') + make_interval(mins => s.tz_offset_min))::date = c.night_date - 1
       order by s.end_at desc
       limit 1
    ) rhr on true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rebuilds one user's normals for the nights between the two dates.
create function public.rebuild_baselines(p_user uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.baselines where user_id = p_user and night_date between p_from and p_to;

  insert into public.baselines (user_id, night_date, metric, median_28, mad_scaled, valid_nights,
                                range_low, range_high, building)
  select n.user_id, n.night_date, m.metric, b.median_28, b.mad * 1.4826, b.valid,
         b.median_28 - 2 * b.mad * 1.4826, b.median_28 + 2 * b.mad * 1.4826, b.valid < 21
    from public.nights n
   cross join (values ('sleeping_hr'), ('hrv'), ('sleep'), ('resp_rate'), ('resting_hr')) as m (metric)
   cross join lateral (
     with w as (
       select case m.metric
                when 'sleeping_hr' then p.sleeping_hr
                when 'hrv' then p.hrv_median
                when 'sleep' then p.asleep_min
                when 'resp_rate' then p.resp_rate
                when 'resting_hr' then p.resting_hr_prev_day
              end as v
         from public.nights p
        where p.user_id = n.user_id
          and p.night_date between n.night_date - 28 and n.night_date - 1
     ), valid as (select v from w where v is not null),
     mid as (select percentile_cont(0.5) within group (order by v) as median_28, count(*)::integer as valid from valid)
     select mid.median_28, mid.valid,
            (select percentile_cont(0.5) within group (order by abs(valid.v - mid.median_28)) from valid) as mad
       from mid
   ) b
   where n.user_id = p_user and n.night_date between p_from and p_to;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rebuilds everything for one user and date range. A night's normal depends
-- on the 28 nights before it, so normals are rebuilt 28 days further on.
-- Running it twice gives the same result.
create function public.recompute(p_user uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nights integer;
  v_baselines integer;
begin
  v_nights := public.rebuild_nights(p_user, p_from, p_to);
  v_baselines := public.rebuild_baselines(p_user, p_from, p_to + 28);
  return jsonb_build_object('nights', v_nights, 'baselines', v_baselines);
end;
$$;

-- Processes the analysis queue (run every minute by pg_cron). Each user's
-- pending work is merged into one date range and recomputed once. While an
-- import is still arriving (a backfill post in the last 2 minutes), that
-- user's work waits, so an import recomputes once at the end. Imports never
-- ask for a notification.
create function public.run_analysis_queue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_done integer := 0;
begin
  -- One run at a time.
  if not pg_try_advisory_xact_lock(hashtext('run_analysis_queue')) then
    return 0;
  end if;

  for v_user in
    select q.user_id, min(q.from_date) as from_date, max(q.to_date) as to_date, array_agg(q.id) as ids
      from public.analysis_queue q
     where q.status = 'pending'
       and not exists (
         select 1 from public.analysis_queue b
          where b.user_id = q.user_id and b.status = 'pending' and b.reason = 'backfill'
            and b.queued_at > now() - interval '2 minutes')
     group by q.user_id
  loop
    begin
      perform public.recompute(v_user.user_id, v_user.from_date, v_user.to_date);
      update public.analysis_queue set status = 'done', done_at = now() where id = any (v_user.ids);
      v_done := v_done + 1;
    exception when others then
      update public.analysis_queue set status = 'failed', done_at = now(), error = left(sqlerrm, 300)
       where id = any (v_user.ids);
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.rebuild_nights(uuid, date, date) from public, anon, authenticated;
revoke all on function public.rebuild_baselines(uuid, date, date) from public, anon, authenticated;
revoke all on function public.recompute(uuid, date, date) from public, anon, authenticated;
revoke all on function public.run_analysis_queue() from public, anon, authenticated;
grant execute on function public.recompute(uuid, date, date) to service_role;
grant execute on function public.run_analysis_queue() to service_role;

-- Every minute (tech-spec section 4, Schedulers).
create extension if not exists pg_cron;
select cron.schedule('run-analysis-queue', '* * * * *', 'select public.run_analysis_queue()');

-- Queue a first full recompute for everyone who already has readings.
insert into public.analysis_queue (user_id, from_date, to_date, reason)
select user_id, min(start_at)::date - 1, (now() at time zone 'utc')::date + 1, 'manual'
  from public.samples
 group by user_id;

-- The storing function now also queues the analysis. Everything else is
-- unchanged from 20261003190000_review_fixes.sql.
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
