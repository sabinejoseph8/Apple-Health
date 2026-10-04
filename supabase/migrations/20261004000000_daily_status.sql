-- Phase 2b: score settings, the daily status and insights (docs/tech-spec.md,
-- section 3; docs/progress.md, Phase 2; product-spec R24, R30 to R33, R40;
-- decisions D6, D11, D24, D35, D36 and D51 to D53).
--
-- Rules agreed by Sabine on 3 October 2026 (Phase 2b plan):
-- - D51 Points: each score reading earns its weight times how many spreads
--   it was worse than normal (0 when normal or better). The spread is the
--   normal's scaled MAD. The design's sample day gives HRV 0.9, sleep 0.6
--   and sleeping heart rate 0.1, a total of 1.6: Ease off.
-- - D52 Nudge: Ready, train as planned; Rest, rest; Ease off, prioritise
--   sleep when sleep earns the most points, otherwise train easy.
-- - D53 Illness check: a pattern note when at least 3 of the 4 overnight
--   markers (sleeping heart rate up, HRV down, breathing rate up, Apple's
--   resting heart rate up) are each at least 1 spread the wrong way. It
--   needs 3 markers with a finished normal to run, and it never changes the
--   status or the nudge (R33).
-- Missing and building readings follow D35 and D36: one reading missing or
-- still building, and its weight moves to the other two in proportion; two
-- or more missing, or no sleep, and there is no status ("not enough data");
-- two or more still building, and the day shows "Learning your normal".
--
-- Waiting for this morning's sync, no sync by noon and late syncs depend on
-- clock times, so they come with the card and notifications (Phases 3 and
-- 4); daily_status keeps their reason codes for then.

-- Score settings: versioned. Exactly one version is active; a frozen version
-- can't be changed (frozen for the test, tech-spec pattern 8). Internal only:
-- the weights are never shown to users (R40).
create table public.score_settings (
  version integer primary key,
  weights jsonb not null,
  ease_off_at numeric not null,
  rest_at numeric not null,
  window_nights integer not null check (window_nights between 7 and 90),
  min_valid_nights integer not null check (min_valid_nights >= 1),
  -- Per reading: window_nights, min_valid_nights, and for HRV min_count
  -- (the fewest readings in a night for it to count; Phase 2c decides).
  per_metric_overrides jsonb not null default '{}'::jsonb,
  -- The smallest spread used, per reading, so a very steady reading can't
  -- make a tiny difference look huge (or divide by zero).
  min_spread jsonb not null,
  illness_spreads numeric not null,
  illness_min_markers integer not null,
  -- 'ease_off' caps a day scored from 2 of 3 readings at Ease off
  -- (product-spec open question 2; Phase 2c decides). Null means no cap.
  partial_cap text check (partial_cap in ('ease_off')),
  frozen boolean not null default false,
  active boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  check (ease_off_at < rest_at)
);

create unique index score_settings_one_active on public.score_settings (active) where active;

alter table public.score_settings enable row level security;
revoke all on public.score_settings from anon, authenticated;

create function public.score_settings_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.frozen then
    raise exception 'score settings version % is frozen', old.version;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger score_settings_frozen
  before update or delete on public.score_settings
  for each row execute function public.score_settings_frozen();

-- The starting numbers (D24, product-spec open question 1).
insert into public.score_settings (version, weights, ease_off_at, rest_at, window_nights, min_valid_nights,
                                   per_metric_overrides, min_spread, illness_spreads, illness_min_markers, active, note)
values (1, '{"hrv": 0.40, "sleeping_hr": 0.35, "sleep": 0.25}', 1, 2, 28, 21,
        '{"hrv": {"min_count": 1}}',
        '{"hrv": 1, "sleeping_hr": 1, "sleep": 10, "resp_rate": 0.2, "resting_hr": 1}',
        1, 3, true, 'Starting numbers, before Phase 2c tuning');

-- The daily status: one row per user per day.
create table public.daily_status (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  status text not null check (status in ('ready', 'ease_off', 'rest', 'none')),
  no_status_reason text check (no_status_reason in ('waiting', 'night_unfinished', 'no_sync', 'not_enough_data', 'learning')),
  readings_used integer not null check (readings_used between 0 and 3),
  -- Per score reading: value, normal, range, verdict (below, above,
  -- in_range, missing, building), spreads worse than normal, points, and
  -- whether it was counted. Never the weights.
  points jsonb not null,
  total numeric,
  nudge text check (nudge in ('train_as_planned', 'train_easy', 'rest', 'prioritise_sleep')),
  -- Counted readings that earned points, most points first, for example
  -- {hrv_outside_range, sleep_worse_than_normal}.
  reason_codes text[] not null default '{}',
  -- Null when the illness check couldn't run (fewer than 3 inputs).
  composite_fired boolean,
  composite_inputs text[] not null default '{}',
  is_late boolean not null default false,
  settings_version integer not null references public.score_settings (version),
  computed_at timestamptz not null default now(),
  primary key (user_id, date),
  check ((status = 'none') = (no_status_reason is not null)),
  check ((status = 'none') = (nudge is null))
);

alter table public.daily_status enable row level security;

create policy "daily status: read own"
  on public.daily_status for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.daily_status from anon, authenticated;
grant select on public.daily_status to authenticated;

-- Insights: the shared output of every analysis module (tech-spec pattern
-- 7). The card, digest and nudge read daily_status and insights only.
create table public.insights (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  module text not null check (module in ('readiness', 'also_checked', 'illness_check')),
  metric text not null,
  value numeric,
  baseline numeric,
  -- Signed: spreads above (+) or below (-) normal.
  deviation numeric,
  severity text not null,
  explanation_code text not null,
  payload jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (user_id, date, module, metric)
);

alter table public.insights enable row level security;

create policy "insights: read own"
  on public.insights for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.insights from anon, authenticated;
grant select on public.insights to authenticated;

-- The active settings (one row).
create function public.active_score_settings()
returns public.score_settings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set public.score_settings;
begin
  select * into v_set from public.score_settings where active;
  if not found then
    raise exception 'no active score settings';
  end if;
  return v_set;
end;
$$;

-- Normals now read their window, minimum and smallest spread from the active
-- settings (unchanged results with version 1). For HRV, a night counts only
-- with at least min_count readings, as in the status.
create or replace function public.rebuild_baselines(p_user uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.score_settings := public.active_score_settings();
  v_count integer;
begin
  delete from public.baselines where user_id = p_user and night_date between p_from and p_to;

  insert into public.baselines (user_id, night_date, metric, median_28, mad_scaled, valid_nights,
                                range_low, range_high, building)
  select n.user_id, n.night_date, m.metric, b.median_28, b.spread, b.valid,
         b.median_28 - 2 * b.spread, b.median_28 + 2 * b.spread, b.valid < m.min_valid
    from public.nights n
   cross join lateral (
     select x.metric,
            coalesce((v_set.per_metric_overrides -> x.metric ->> 'window_nights')::integer, v_set.window_nights) as window_nights,
            coalesce((v_set.per_metric_overrides -> x.metric ->> 'min_valid_nights')::integer, v_set.min_valid_nights) as min_valid,
            coalesce((v_set.per_metric_overrides -> 'hrv' ->> 'min_count')::integer, 1) as hrv_min_count,
            coalesce((v_set.min_spread ->> x.metric)::numeric, 0) as min_spread
       from (values ('sleeping_hr'), ('hrv'), ('sleep'), ('resp_rate'), ('resting_hr')) as x (metric)
   ) m
   cross join lateral (
     with w as (
       select case m.metric
                when 'sleeping_hr' then p.sleeping_hr
                when 'hrv' then case when p.hrv_count >= m.hrv_min_count then p.hrv_median end
                when 'sleep' then p.asleep_min
                when 'resp_rate' then p.resp_rate
                when 'resting_hr' then p.resting_hr_prev_day
              end as v
         from public.nights p
        where p.user_id = n.user_id
          and p.night_date between n.night_date - m.window_nights and n.night_date - 1
     ), valid as (select v from w where v is not null),
     mid as (select percentile_cont(0.5) within group (order by v) as median_28, count(*)::integer as valid from valid),
     spread as (
       select mid.median_28, mid.valid,
              (select percentile_cont(0.5) within group (order by abs(valid.v - mid.median_28)) from valid) * 1.4826 as mad_scaled
         from mid
     )
     select median_28, valid, case when mad_scaled is not null then greatest(mad_scaled, m.min_spread) end as spread
       from spread
   ) b
   where n.user_id = p_user and n.night_date between p_from and p_to;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rebuilds one user's daily status and insights for the days between the
-- two dates: every day with a night, and every day with a morning sync.
create function public.rebuild_status(p_user uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.score_settings := public.active_score_settings();
  v_hrv_min integer := coalesce((v_set.per_metric_overrides -> 'hrv' ->> 'min_count')::integer, 1);
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

-- Rebuilds everything for one user and date range: nights, then normals and
-- the status up to the longest normal window further on (a day's normal
-- depends on the nights before it). Running it twice gives the same result.
create or replace function public.recompute(p_user uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.score_settings := public.active_score_settings();
  v_window integer;
  v_nights integer;
  v_baselines integer;
  v_status integer;
begin
  select greatest(v_set.window_nights, coalesce(max((o.value ->> 'window_nights')::integer), 0)) into v_window
    from jsonb_each(v_set.per_metric_overrides) as o;
  v_nights := public.rebuild_nights(p_user, p_from, p_to);
  v_baselines := public.rebuild_baselines(p_user, p_from, p_to + v_window);
  v_status := public.rebuild_status(p_user, p_from, p_to + v_window);
  return jsonb_build_object('nights', v_nights, 'baselines', v_baselines, 'status', v_status);
end;
$$;

revoke all on function public.score_settings_frozen() from public, anon, authenticated;
revoke all on function public.active_score_settings() from public, anon, authenticated;
revoke all on function public.rebuild_status(uuid, date, date) from public, anon, authenticated;

-- Build everyone's status now (the minute job picks this up).
insert into public.analysis_queue (user_id, from_date, to_date, reason)
select user_id, min(start_at)::date - 1, (now() at time zone 'utc')::date + 1, 'manual'
  from public.samples
 group by user_id;
