-- Phase 2b: the daily status, nudge, illness check and insights (D35, D36,
-- D51 to D53; docs/progress.md, Phase 2 automated tests). Nights and normals
-- are written directly with made-up values, so each case is exact.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- These cases use the starting numbers (version 1), which the agreed
-- examples were written for; version 2 is checked in 10_final_settings.
update public.score_settings set active = false where active;
update public.score_settings set active = true where version = 1;

insert into auth.users (id, email) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user-k@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'user-l@example.test');

-- A night with the given readings (minutes asleep, sleeping heart rate,
-- HRV, breathing rate, resting heart rate).
create function pg_temp.night(p_date date, p_sleep numeric, p_shr numeric, p_hrv numeric, p_rr numeric, p_rhr numeric,
                              p_finished boolean default true) returns void language sql as $$
  insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                             sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count,
                             resting_hr_prev_day, coverage, confidence)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', p_date, -300, p_date - interval '7 hours', p_date + interval '6 hours',
          p_sleep, p_finished, p_shr, case when p_shr is null then 3 else 60 end, p_hrv, case when p_hrv is null then 0 else 3 end,
          p_rr, case when p_rr is null then 0 else 30 end, p_rhr, 1, 'high')
$$;

-- A normal: median and spread, range 2 spreads either side.
create function pg_temp.normal(p_date date, p_metric text, p_median numeric, p_spread numeric, p_building boolean default false)
returns void language sql as $$
  insert into public.baselines (user_id, night_date, metric, median_28, mad_scaled, valid_nights, range_low, range_high, building)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', p_date, p_metric, p_median, p_spread, case when p_building then 12 else 28 end,
          p_median - 2 * p_spread, p_median + 2 * p_spread, p_building)
$$;

-- The design's normals (Clarivi Screens, Tuesday 29 September): HRV 52
-- (range 40 to 64), sleep 7h 10m (6h 02m to 8h 18m), sleeping heart rate 50.
create function pg_temp.normals(p_date date, p_hrv_building boolean default false, p_sleep_building boolean default false)
returns void language sql as $$
  select pg_temp.normal(p_date, 'hrv', 52, 6, p_hrv_building);
  select pg_temp.normal(p_date, 'sleep', 430, 34, p_sleep_building);
  select pg_temp.normal(p_date, 'sleeping_hr', 50, 2.5);
  select pg_temp.normal(p_date, 'resp_rate', 15, 0.5);
  select pg_temp.normal(p_date, 'resting_hr', 58, 2);
$$;

-- 29 September, the sample day: HRV 38, sleep 5h 52m, sleeping heart rate 51.
select pg_temp.night('2026-09-29', 352, 51, 38, 15, 58);
select pg_temp.normals('2026-09-29');
-- 30 September: the same, with HRV missing.
select pg_temp.night('2026-09-30', 352, 51, null, 15, 58);
select pg_temp.normals('2026-09-30');
-- 1 October: HRV and sleeping heart rate missing.
select pg_temp.night('2026-10-01', 352, null, null, 15, 58);
select pg_temp.normals('2026-10-01');
-- 2 October: HRV and sleep normals still building.
select pg_temp.night('2026-10-02', 352, 51, 38, 15, 58);
select pg_temp.normals('2026-10-02', true, true);
-- 3 October: HRV building and sleeping heart rate missing.
select pg_temp.night('2026-10-03', 352, null, 38, 15, 58);
select pg_temp.normals('2026-10-03', true);
-- 4 October: everything at normal. 5 October: HRV well above normal.
select pg_temp.night('2026-10-04', 430, 50, 52, 15, 58);
select pg_temp.normals('2026-10-04');
select pg_temp.night('2026-10-05', 430, 50, 70, 15, 58);
select pg_temp.normals('2026-10-05');
-- 6 October: HRV 20, far below normal.
select pg_temp.night('2026-10-06', 430, 50, 20, 15, 58);
select pg_temp.normals('2026-10-06');
-- 7 October: the sample day's readings, but the night isn't finished.
select pg_temp.night('2026-10-07', 352, 51, 38, 15, 58, false);
select pg_temp.normals('2026-10-07');
-- 8 October: sleeping heart rate, HRV and breathing rate each a little
-- the wrong way (1.2, 1.17 and 1.2 spreads); sleep normal.
select pg_temp.night('2026-10-08', 430, 53, 45, 15.6, 58);
select pg_temp.normals('2026-10-08');
-- 9 October: no breathing rate or resting heart rate.
select pg_temp.night('2026-10-09', 430, 50, 52, null, null);
select pg_temp.normals('2026-10-09');
-- 10 October: a morning sync arrived, but no night was recorded.
insert into public.uploads (user_id, schema_version, kind, device_tz_offset_min, local_date, status)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'daily', -300, '2026-10-10', 'accepted');
-- 11 October: only sleep is off (4h 10m).
select pg_temp.night('2026-10-11', 250, 50, 52, 15, 58);
select pg_temp.normals('2026-10-11');
-- 12 October: HRV missing and very short sleep (3h 20m).
select pg_temp.night('2026-10-12', 200, 50, null, 15, 58);
select pg_temp.normals('2026-10-12');

select is(public.rebuild_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-09-28', '2026-10-13'), 14,
  'a status row for every night and every morning sync');

create temp view s as select * from public.daily_status where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- The sample day (D51).
select is((select round((points -> 'hrv' ->> 'points')::numeric, 1) from s where date = '2026-09-29'), 0.9,
  'HRV 38 against 52 (2.3 spreads worse) earns 0.9 points');
select is((select round((points -> 'sleep' ->> 'points')::numeric, 1) from s where date = '2026-09-29'), 0.6,
  'sleep 5h 52m against 7h 10m earns 0.6');
select is((select round((points -> 'sleeping_hr' ->> 'points')::numeric, 1) from s where date = '2026-09-29'), 0.1,
  'sleeping heart rate 51 against 50 earns 0.1');
select is((select round(total, 1) from s where date = '2026-09-29'), 1.6, 'the total is 1.6');
select is((select status from s where date = '2026-09-29'), 'ease_off', 'which is Ease off');
select is((select nudge from s where date = '2026-09-29'), 'train_easy', 'HRV leads, so the nudge is train easy (D52)');
select is((select reason_codes from s where date = '2026-09-29'),
  array['hrv_outside_range', 'sleep_outside_range', 'sleeping_hr_worse_than_normal'],
  'the reasons, most points first');
select is((select readings_used from s where date = '2026-09-29'), 3, 'all three readings were used');
select is((select settings_version from s where date = '2026-09-29'), 1, 'the settings version is recorded');

-- One reading missing (D35).
select is((select round(total, 2) from s where date = '2026-09-30'), 1.19,
  'with HRV missing, its weight moves to the other two: total 1.19');
select is((select status from s where date = '2026-09-30'), 'ease_off', 'still Ease off');
select is((select readings_used from s where date = '2026-09-30'), 2, 'based on 2 of 3 readings');
select is((select points -> 'hrv' ->> 'verdict' from s where date = '2026-09-30'), 'missing', 'HRV shows as missing');
select is((select (points -> 'hrv' ->> 'counted')::boolean from s where date = '2026-09-30'), false, 'and not counted');
select is((select nudge from s where date = '2026-09-30'), 'prioritise_sleep',
  'without HRV, sleep earns the most points, so the nudge is prioritise sleep');

-- Not enough data, learning, unfinished (D35, D36, R26, R31, R32).
select is((select status || '/' || no_status_reason from s where date = '2026-10-01'), 'none/not_enough_data',
  'two readings missing: no status, not enough data');
select is((select nudge from s where date = '2026-10-01'), null, 'and no nudge');
select is((select status || '/' || no_status_reason from s where date = '2026-10-02'), 'none/learning',
  'two normals still building: learning your normal, never Ready');
select is((select status || '/' || no_status_reason from s where date = '2026-10-03'), 'none/not_enough_data',
  'one building and one missing: not enough data');
select is((select status || '/' || no_status_reason from s where date = '2026-10-07'), 'none/night_unfinished',
  'an unfinished night gets no status');
select is((select status || '/' || no_status_reason || '/' || readings_used from s where date = '2026-10-10'),
  'none/not_enough_data/0', 'a morning sync with no night recorded: not enough data');

-- Zones and nudges.
select is((select status || '/' || nudge || '/' || (total = 0) from s where date = '2026-10-04'), 'ready/train_as_planned/true',
  'everything at normal: Ready with 0 points, train as planned');
select is((select reason_codes from s where date = '2026-10-04'), '{}'::text[], 'with no reasons');
select is((select status || '/' || ((points -> 'hrv' ->> 'points')::numeric = 0) || '/' || (points -> 'hrv' ->> 'verdict')
             from s where date = '2026-10-05'), 'ready/true/above',
  'a reading better than normal earns no points');
select is((select status || '/' || nudge from s where date = '2026-10-06'), 'rest/rest', 'HRV far below normal: Rest');
select is((select status || '/' || nudge from s where date = '2026-10-11'), 'ease_off/prioritise_sleep',
  'only sleep is off: Ease off, prioritise sleep');
select is((select status from s where date = '2026-10-12'), 'rest', 'from 2 of 3 readings, Rest is possible with no cap');

-- The illness check (D53).
select is((select composite_fired from s where date = '2026-09-29'), false,
  'the sample day: only HRV moved, so no pattern');
select is((select composite_inputs from s where date = '2026-09-29'),
  array['hrv', 'resp_rate', 'resting_hr', 'sleeping_hr'], 'it ran with all four markers');
select is((select composite_fired from s where date = '2026-10-08'), true,
  'three markers each a little the wrong way: the pattern note shows');
select is((select status || '/' || nudge from s where date = '2026-10-08'), 'ready/train_as_planned',
  'and it never changes the status or the nudge');
select is((select composite_fired from s where date = '2026-10-09'), null,
  'with only 2 markers available, the check does not run');

-- Insights.
select is((select count(*)::int from public.insights
            where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and date = '2026-09-29'), 6,
  'each of the 5 readings and the illness check is written to insights');
select is((select severity || '/' || round(deviation, 2) from public.insights
            where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and date = '2026-09-29' and metric = 'hrv'),
  'below/-2.33', 'HRV is below its normal range, 2.33 spreads under normal');
select is((select severity || '/' || explanation_code from public.insights
            where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and date = '2026-10-08' and module = 'illness_check'),
  'fired/readings_moved_together', 'the illness check is written as a pattern, never a condition');

-- Running it again gives the same result.
create temp table first_run as
select md5(string_agg(row(date, status, no_status_reason, readings_used, points, total, nudge, reason_codes,
                          composite_fired, composite_inputs)::text, ',' order by date)) as h from s;
select public.rebuild_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-09-28', '2026-10-13');
select is((select md5(string_agg(row(date, status, no_status_reason, readings_used, points, total, nudge, reason_codes,
                                     composite_fired, composite_inputs)::text, ',' order by date)) from s),
          (select h from first_run), 'recomputing gives an identical status');

-- Settings: a new version with the ease-off cap for 2 of 3 readings.
update public.score_settings set active = false where version = 1;
insert into public.score_settings (version, weights, ease_off_at, rest_at, window_nights, min_valid_nights,
                                   per_metric_overrides, min_spread, illness_spreads, illness_min_markers, partial_cap, active)
select 99, weights, ease_off_at, rest_at, window_nights, min_valid_nights, per_metric_overrides, min_spread,
       illness_spreads, illness_min_markers, 'ease_off', true
  from public.score_settings where version = 1;
select public.rebuild_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-10-12', '2026-10-12');
select is((select status || '/' || settings_version from s where date = '2026-10-12'), 'ease_off/99',
  'with the cap, a day from 2 of 3 readings stops at Ease off, and records the version used');

-- Frozen settings can't change.
update public.score_settings set frozen = true where version = 99;
select throws_ok('update public.score_settings set rest_at = 3 where version = 99', 'P0001',
  'score settings version 99 is frozen', 'a frozen settings version cannot be changed');
select throws_ok('delete from public.score_settings where version = 99', 'P0001',
  'score settings version 99 is frozen', 'or deleted');

-- The whole chain from readings: recompute builds the status too.
insert into public.uploads (id, user_id, schema_version, kind, device_tz_offset_min, local_date, status)
values ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 'daily', -300, current_date, 'accepted');
insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, stage, value, sample_hash)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-0000-0000-0000-000000000001', 'sleep_stage',
        '2026-09-28 23:00-05', '2026-09-29 06:30-05', -300, 'core', null, sha256(convert_to('c1', 'UTF8'))),
       ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-0000-0000-0000-000000000001', 'hrv_sdnn',
        '2026-09-29 03:00-05', '2026-09-29 03:01-05', -300, null, 45, sha256(convert_to('c2', 'UTF8')));
insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, sample_hash)
select 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-0000-0000-0000-000000000001', 'heart_rate', t, t, -300, 52,
       sha256(convert_to(t::text, 'UTF8'))
  from generate_series(timestamptz '2026-09-28 23:30-05', '2026-09-29 05:30-05', interval '30 minutes') as t;
select is((public.recompute('cccccccc-cccc-cccc-cccc-cccccccccccc', '2026-09-28', '2026-09-30') ->> 'status')::int, 2,
  'recompute also builds the status: the night, and this morning''s sync');
select is((select status || '/' || no_status_reason from public.daily_status
            where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and date = '2026-09-29'), 'none/learning',
  'a first night has no normals yet: learning your normal');

-- Isolation and access.
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';
select is((select count(distinct user_id)::int from public.daily_status), 1, 'a user sees only their own status');
select throws_ok('select * from public.score_settings', '42501', null, 'users cannot read the score settings (R40)');
select throws_ok('delete from public.insights', '42501', null, 'insights cannot be changed directly');

reset role;
select * from finish();
rollback;
