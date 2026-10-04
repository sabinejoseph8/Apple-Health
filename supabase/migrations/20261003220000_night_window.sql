-- Phase 2a fix: a night is all sleep from 6pm to noon (D50, decided by
-- Sabine on 3 October 2026; replaces D48's 90-minute rule). Checking
-- one night against the Health app showed Clarivi counting about two hours
-- less: Sabine had been awake for longer than 90 minutes in the early
-- morning and slept again, and the 90-minute rule split the night and kept
-- only its longer part. That happened on 41 of her 239 nights.
--
-- Now every stretch of time asleep that starts from 6pm to noon (local
-- time) counts towards that morning's night, however long the breaks
-- between them; this is the same window as heart rate (D43). Stretches
-- starting from noon to 6pm are naps and don't count. A night still needs
-- 2 hours asleep in all (D48), overlapping records still count once with
-- awake winning (D49), and sleeping heart rate still uses only the time
-- asleep. The sleep window used for HRV and breathing rate runs from the
-- first to the last moment asleep. Everything else is as in
-- 20261003210000_sleep_overlaps.sql.

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
    -- The separate stretches of time asleep, each with the local time it
    -- starts at (from the offset of the asleep stage it starts in).
    select lower(r) as start_at, upper(r) as end_at, o.tz_offset_min,
           (lower(r) at time zone 'utc') + make_interval(mins => o.tz_offset_min) as local_start
      from net
     cross join lateral unnest(net.asleep) as r
     cross join lateral (
       select s.tz_offset_min
         from public.samples s
        where s.user_id = p_user and s.type = 'sleep_stage' and s.stage in ('core', 'deep', 'rem')
          and s.end_at > lower(r) and s.end_at < lower(r) + interval '1 day'
          and s.start_at <= lower(r)
        order by s.end_at
        limit 1
     ) o
  ), placed as (
    -- A stretch starting from 6pm belongs to the next morning's night.
    select seg.*, (local_start + interval '6 hours')::date as night_date
      from seg
  ), chosen as (
    -- A night is all the time asleep in stretches starting from 6pm the
    -- evening before to noon (D50), if it reaches 2 hours. Stretches
    -- starting from noon to 6pm are naps.
    select night_date, min(start_at) as sleep_start, max(end_at) as sleep_end,
           sum(extract(epoch from end_at - start_at)) / 60 as asleep_min,
           range_agg(tstzrange(start_at, end_at)) as asleep,
           (array_agg(tz_offset_min order by end_at desc))[1] as tz_offset_min
      from placed
     where local_start < night_date + interval '12 hours'
       and night_date between p_from and p_to
     group by night_date
    having sum(extract(epoch from end_at - start_at)) / 60 >= 120
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
