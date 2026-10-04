-- Phase 2 code review fixes (3 October 2026; docs/progress.md, End of
-- Phase 2).
--
-- 1. A day with a morning sync but no night yet is "night not finished" on
--    the user's current day, not "not enough data": the night has usually
--    just not arrived from the Watch yet (R25, R26, R31).
-- 2. Analysis work that fails is tried again on the next runs, up to 3 times,
--    instead of being dropped at the first error.
-- 3. Score settings must give every reading a positive smallest spread, so a
--    very steady reading can never make the status divide by zero.
-- 4. The every-minute job's log (cron.job_run_details) is trimmed daily.
-- 5. Two column names from Phase 2a no longer say exactly what they hold;
--    comments say it instead.

alter table public.analysis_queue add column attempts integer not null default 0;

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
  return v_count;
end;
$$;


create or replace function public.run_analysis_queue()
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
      -- Try again on the next runs; give up after 3 attempts.
      update public.analysis_queue
         set attempts = attempts + 1, error = left(sqlerrm, 300),
             status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
             done_at = case when attempts + 1 >= 3 then now() end
       where id = any (v_user.ids);
    end;
  end loop;
  return v_done;
end;
$$;


-- (A missing value counts as 0, so it is refused too.)
alter table public.score_settings add constraint score_settings_min_spread_positive check (
  coalesce((min_spread ->> 'hrv')::numeric, 0) > 0 and coalesce((min_spread ->> 'sleeping_hr')::numeric, 0) > 0
  and coalesce((min_spread ->> 'sleep')::numeric, 0) > 0 and coalesce((min_spread ->> 'resp_rate')::numeric, 0) > 0
  and coalesce((min_spread ->> 'resting_hr')::numeric, 0) > 0);

-- Keep a week of the job log.
select cron.schedule('trim-cron-log', '17 3 * * *',
  $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$);

comment on column public.baselines.median_28 is
  'The median of the nights in the active settings'' window before this night (28 in version 1, 42 in version 2).';
comment on column public.baselines.mad_scaled is
  'The spread: the scaled MAD (MAD x 1.4826) of those nights, raised to the settings'' smallest spread for this reading.';
