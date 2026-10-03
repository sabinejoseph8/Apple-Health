-- Phase 2a fix: overlapping sleep records (D49, decided by Sabine on
-- 3 October 2026). On 18 of Sabine's 239 nights, two records cover the same
-- time: a second, coarse set of stages on top of the Watch's own (December
-- 2025), or the same stretch recorded as both asleep and awake (July 2026).
-- Adding up the stages counted that time twice (time asleep could exceed
-- the length of the sleep). Shortcuts gives sleep no source, so the
-- records can't be told apart by name.
--
-- Now each moment counts once, and where one record says awake and another
-- asleep, it counts as awake (closest to the Watch's own record, which
-- writes its awake times in detail). The 90-minute rule (D48) is applied
-- after the awake time is taken out, so a night broken by more than 90
-- minutes awake counts its longer part. Nights without overlaps are
-- unchanged. Everything else is as in 20261003200000_nights_and_baselines.sql.

create or replace function public.rebuild_nights(p_user uuid, p_from date, p_to date)
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

  with stages as (
    -- Asleep and awake stages that could belong to a night in range (two
    -- days of margin either side for long sleeps and time zones).
    select s.start_at, s.end_at, s.stage
      from public.samples s
     where s.user_id = p_user and s.type = 'sleep_stage' and s.stage in ('core', 'deep', 'rem', 'awake')
       and s.end_at >= (p_from - 2)::timestamp at time zone 'utc'
       and s.end_at < (p_to + 3)::timestamp at time zone 'utc'
       and s.start_at < (p_to + 2)::timestamp at time zone 'utc'
  ), net as (
    -- Time asleep, each moment counted once: covered by an asleep stage and
    -- by no awake stage (D49: when records overlap, awake wins).
    select coalesce(range_agg(tstzrange(start_at, end_at)) filter (where stage <> 'awake'), '{}'::tstzmultirange)
         - coalesce(range_agg(tstzrange(start_at, end_at)) filter (where stage = 'awake'), '{}'::tstzmultirange) as asleep
      from stages
  ), seg as (
    -- The separate stretches of time asleep, in order.
    select lower(r) as start_at, upper(r) as end_at
      from net cross join lateral unnest(net.asleep) as r
  ), numbered as (
    select seg.*,
           sum(case when prev_end is null or start_at > prev_end + interval '90 minutes' then 1 else 0 end)
             over (order by start_at) as sleep_no
      from (select seg.*, lag(end_at) over (order by start_at) as prev_end from seg) as seg
  ), sleeps as (
    select sleep_no, min(start_at) as sleep_start, max(end_at) as sleep_end,
           sum(extract(epoch from end_at - start_at)) / 60 as asleep_min,
           range_agg(tstzrange(start_at, end_at)) as asleep
      from numbered group by sleep_no
  ), dated as (
    -- Each sleep takes the offset of the asleep stage it ends in.
    select sleeps.*, o.tz_offset_min,
           ((sleep_end at time zone 'utc') + make_interval(mins => o.tz_offset_min))::date as night_date
      from sleeps
     cross join lateral (
       select s.tz_offset_min
         from public.samples s
        where s.user_id = p_user and s.type = 'sleep_stage' and s.stage in ('core', 'deep', 'rem')
          and s.end_at >= sleeps.sleep_end and s.end_at < sleeps.sleep_end + interval '1 day'
          and s.start_at < sleeps.sleep_end
        order by s.end_at
        limit 1
     ) o
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
      -- Heart rate readings taken while asleep.
      select count(*)::integer as n, count(distinct floor(extract(epoch from h.start_at) / 900)) as blocks,
             percentile_cont(0.5) within group (order by h.value) as median
        from public.samples h
       where h.user_id = p_user and h.type = 'heart_rate'
         and h.end_at >= c.sleep_start and h.end_at < c.sleep_end
         and c.asleep @> h.start_at and c.asleep @> h.end_at
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

-- Rebuild everyone's nights and normals with the new rule (the minute job
-- picks this up).
insert into public.analysis_queue (user_id, from_date, to_date, reason)
select user_id, min(start_at)::date - 1, (now() at time zone 'utc')::date + 1, 'manual'
  from public.samples
 group by user_id;
