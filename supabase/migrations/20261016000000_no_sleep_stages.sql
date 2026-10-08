-- D87 (8 October 2026): a day whose only sleep last night is plain "asleep"
-- (the Watch's sleep without stages) gets its own reason, no_sleep_stages,
-- so the card can say so instead of "sleep still in progress" and then "not
-- enough data". The status stays none: the night builder still counts only
-- core, deep and REM (D10, D49, D86). rebuild_status is copied from
-- 20261004040000_phase2_review_fixes.sql with the stage-less check added;
-- log_usage from 20261010000000_usage_more.sql with the new card name.
-- Every person's statuses are rebuilt once at the end, so past days carry the
-- new reason too (only the reason of stage-less days changes).

alter table public.daily_status drop constraint daily_status_no_status_reason_check;
alter table public.daily_status add constraint daily_status_no_status_reason_check
  check (no_status_reason in ('waiting', 'night_unfinished', 'no_sync', 'not_enough_data', 'learning', 'no_sleep_stages'));

create or replace function public.rebuild_status(p_user uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.score_settings := public.active_score_settings();
  v_hrv_min integer := coalesce((v_set.per_metric_overrides -> 'hrv' ->> 'min_count')::integer, 1);
  -- The user's current local date, from their phone's latest offset.
  v_today date := ((now() at time zone 'utc')
                   + make_interval(mins => coalesce((select latest_tz_offset_min from public.profiles
                                                      where user_id = p_user), 0)))::date;
  v_count integer;
begin
  delete from public.daily_status where user_id = p_user and date between p_from and p_to;
  delete from public.insights where user_id = p_user and date between p_from and p_to
    and module in ('readiness', 'also_checked', 'illness_check');

  create temp table pg_temp.status_readings on commit drop as
  with days as (
    select night_date as date from public.nights where user_id = p_user and night_date between p_from and p_to
    union
    select local_date from public.uploads
     where user_id = p_user and status = 'accepted' and kind = 'daily' and local_date between p_from and p_to
  ), r as (
    -- One row per day and reading. "worse" is the direction that is worse
    -- than normal: lower for HRV and sleep, higher for the others.
    select d.date, m.metric, m.module, m.worse, n.night_date is not null as has_night, n.finished,
           case m.metric
             when 'hrv' then case when n.hrv_count >= v_hrv_min then n.hrv_median end
             when 'sleeping_hr' then n.sleeping_hr
             when 'sleep' then n.asleep_min
             when 'resp_rate' then n.resp_rate
             when 'resting_hr' then n.resting_hr_prev_day
           end as value,
           b.median_28 as normal, b.mad_scaled as spread, b.range_low, b.range_high,
           coalesce(b.building, true) as building,
           (v_set.weights ->> m.metric)::numeric as weight
      from days d
     cross join (values ('hrv', 'readiness', -1), ('sleeping_hr', 'readiness', 1), ('sleep', 'readiness', -1),
                        ('resp_rate', 'also_checked', 1), ('resting_hr', 'also_checked', 1)) as m (metric, module, worse)
      left join public.nights n on n.user_id = p_user and n.night_date = d.date
      left join public.baselines b on b.user_id = p_user and b.night_date = d.date and b.metric = m.metric
  )
  select r.*,
         case when value is null then 'missing' when building then 'building'
              when value < range_low then 'below' when value > range_high then 'above'
              else 'in_range' end as verdict,
         case when value is not null and not building then (value - normal) / spread end as deviation,
         case when value is not null and not building then greatest(0, worse * (value - normal) / spread) end as spreads_worse
    from r;
  create index on pg_temp.status_readings (date);
  analyze pg_temp.status_readings;

  -- D87: nights whose only sleep is plain "asleep" (no Watch stages), at
  -- least 2 hours of it, placed like the night builder places a stretch: by
  -- the record's own local start time, 6pm the evening before to noon,
  -- dated by that morning (D50). The night builder never counts these
  -- (D10, D49), so the day has no night; it is labelled no_sleep_stages
  -- instead of night_unfinished or not_enough_data.
  create temp table pg_temp.status_stageless on commit drop as
  select k.night_date
    from public.samples x
   cross join lateral (select (x.start_at at time zone 'utc') + make_interval(mins => coalesce(x.tz_offset_min, 0)) as local_start) l
   cross join lateral (select (l.local_start + interval '6 hours')::date as night_date) k
   where x.user_id = p_user and x.type = 'sleep_stage' and x.stage in ('asleep', 'core', 'deep', 'rem')
     and x.end_at >= ((p_from - 2)::timestamp at time zone 'utc') and x.start_at < ((p_to + 2)::timestamp at time zone 'utc')
     and l.local_start < k.night_date + interval '12 hours'
     and k.night_date between p_from and p_to
   group by k.night_date
  having count(*) filter (where x.stage in ('core', 'deep', 'rem')) = 0
     and sum(extract(epoch from (x.end_at - x.start_at))) filter (where x.stage = 'asleep') >= 7200;

  create temp table pg_temp.status_days on commit drop as
  with per_day as (
    select date, bool_or(has_night) as has_night, bool_and(coalesce(finished, false)) as finished,
           count(*) filter (where module = 'readiness' and verdict not in ('missing', 'building'))::integer as used,
           count(*) filter (where module = 'readiness' and verdict = 'building')::integer as building,
           sum(weight) filter (where module = 'readiness' and verdict not in ('missing', 'building')) as weight_used,
           -- Illness check inputs: the 4 markers with a value and a finished normal.
           array_agg(metric order by metric) filter (where metric <> 'sleep' and verdict not in ('missing', 'building')) as composite_inputs,
           count(*) filter (where metric <> 'sleep' and verdict not in ('missing', 'building')
                              and worse * deviation >= v_set.illness_spreads)::integer as markers_moved
      from pg_temp.status_readings
     group by date
  )
  select p.*,
         case when p.used >= 2 then
           (select sum(s.weight / p.weight_used * s.spreads_worse) from pg_temp.status_readings s
             where s.date = p.date and s.module = 'readiness' and s.verdict not in ('missing', 'building'))
         end as total
    from per_day p;

  insert into public.daily_status (user_id, date, status, no_status_reason, readings_used, points, total, nudge,
                                   reason_codes, composite_fired, composite_inputs, settings_version)
  select p_user, d.date, z.status,
         case when z.status = 'none' then z.reason end,
         d.used,
         pts.points,
         case when z.status <> 'none' then d.total end,
         case z.status
           when 'ready' then 'train_as_planned'
           when 'rest' then 'rest'
           when 'ease_off' then case when pts.sleep_leads then 'prioritise_sleep' else 'train_easy' end
         end,
         case when z.status <> 'none' then coalesce(pts.reason_codes, '{}') else '{}' end,
         case when coalesce(cardinality(d.composite_inputs), 0) >= 3 then d.markers_moved >= v_set.illness_min_markers end,
         coalesce(d.composite_inputs, '{}'),
         v_set.version
    from pg_temp.status_days d
   cross join lateral (
     select case
              when not d.has_night then 'none'
              when not d.finished then 'none'
              when d.building >= 2 then 'none'
              when d.used < 2 then 'none'
              when d.total >= v_set.rest_at and not (d.used = 2 and v_set.partial_cap is not distinct from 'ease_off') then 'rest'
              when d.total >= v_set.ease_off_at then 'ease_off'
              else 'ready'
            end as status,
            case
              -- A sync has come today but last night's sleep hasn't arrived
              -- yet (usually the Watch hasn't handed it over): sleep still
              -- in progress (R26), not "not enough data" (R31). The card
              -- shows not enough data once it's past noon (Phase 3).
              -- The Watch's sleep arrived without stages (D87).
              when not d.has_night and exists (select 1 from pg_temp.status_stageless sl where sl.night_date = d.date)
                then 'no_sleep_stages'
              when not d.has_night and d.date = v_today then 'night_unfinished'
              when not d.has_night then 'not_enough_data'
              when not d.finished then 'night_unfinished'
              when d.building >= 2 then 'learning'
              else 'not_enough_data'
            end as reason
   ) z
   cross join lateral (
     select jsonb_object_agg(s.metric, jsonb_build_object(
              'value', s.value, 'normal', s.normal, 'range_low', s.range_low, 'range_high', s.range_high,
              'verdict', s.verdict, 'spreads_worse', s.spreads_worse,
              'counted', s.verdict not in ('missing', 'building') and d.used >= 2,
              'points', case when s.verdict not in ('missing', 'building') and d.used >= 2
                             then s.weight / d.weight_used * s.spreads_worse end)) as points,
            array_agg(s.metric || case when s.verdict in ('below', 'above') then '_outside_range' else '_worse_than_normal' end
                      order by s.weight * s.spreads_worse desc, s.metric)
              filter (where s.verdict not in ('missing', 'building') and d.used >= 2 and s.spreads_worse > 0) as reason_codes,
            coalesce(max(s.weight * s.spreads_worse) filter (where s.metric = 'sleep' and s.verdict not in ('missing', 'building')), 0)
              > coalesce(max(s.weight * s.spreads_worse) filter (where s.metric <> 'sleep' and s.verdict not in ('missing', 'building')), 0)
              as sleep_leads
       from pg_temp.status_readings s
      where s.date = d.date and s.module = 'readiness'
   ) pts;

  get diagnostics v_count = row_count;

  -- Insights: each reading against its normal, and the illness check.
  insert into public.insights (user_id, date, module, metric, value, baseline, deviation, severity, explanation_code, payload)
  select p_user, s.date, s.module, s.metric, s.value, s.normal, s.deviation, s.verdict, s.metric || '_' || s.verdict,
         jsonb_build_object('range_low', s.range_low, 'range_high', s.range_high, 'spreads_worse', s.spreads_worse)
    from pg_temp.status_readings s
   where s.has_night;

  insert into public.insights (user_id, date, module, metric, value, baseline, deviation, severity, explanation_code, payload)
  select p_user, d.date, 'illness_check', 'pattern', d.markers_moved, null, null,
         case when ds.composite_fired then 'fired' when ds.composite_fired is false then 'clear' else 'not_run' end,
         case when ds.composite_fired then 'readings_moved_together' when ds.composite_fired is false then 'no_pattern'
              else 'not_enough_inputs' end,
         jsonb_build_object('inputs', ds.composite_inputs,
                            'moved', (select coalesce(jsonb_agg(s.metric order by s.metric), '[]'::jsonb) from pg_temp.status_readings s
                                       where s.date = d.date and s.metric <> 'sleep' and s.verdict not in ('missing', 'building')
                                         and s.worse * s.deviation >= v_set.illness_spreads))
    from pg_temp.status_days d
    join public.daily_status ds on ds.user_id = p_user and ds.date = d.date
   where d.has_night;

  drop table pg_temp.status_readings;
  drop table pg_temp.status_days;
  drop table pg_temp.status_stageless;
  return v_count;
end;
$$;

create or replace function public.log_usage(p_event text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_event is null or p_event not in ('card_view', 'why_today_open', 'checkin_skipped', 'trends_open', 'digest_open') then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  if jsonb_typeof(v_meta) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_meta) k where k not in ('date', 'status_shown', 'state'))
     or (v_meta ? 'date' and coalesce(v_meta ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$')
     or (v_meta ? 'status_shown' and jsonb_typeof(v_meta -> 'status_shown') <> 'boolean')
     or (v_meta ? 'state' and coalesce(v_meta ->> 'state', '') not in
           ('status', 'waiting', 'analysing', 'night_unfinished', 'missed', 'no_sync', 'not_enough_data', 'learning',
            'no_sleep_stages'))
  then
    raise exception 'unexpected details' using errcode = '22023';
  end if;
  if v_meta ? 'date' then
    perform (v_meta ->> 'date')::date;
  end if;

  if (select count(*) from public.usage_events where user_id = v_user and at > now() - interval '1 day') >= 500 then
    return;
  end if;
  insert into public.usage_events (user_id, event, meta) values (v_user, p_event, v_meta);
end;
$$;

-- Rebuild every person's statuses once, so past stage-less days get the new
-- reason (statuses, nudges and points are unchanged).
do $$
declare
  r record;
begin
  for r in select user_id, min(date) as d_from, max(date) as d_to from public.daily_status group by user_id loop
    perform public.rebuild_status(r.user_id, r.d_from, r.d_to);
  end loop;
end;
$$;
