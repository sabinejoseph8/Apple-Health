-- D96: score settings version 3, a sleep floor. When sleep is counted and 1.5 or
-- more spreads below the usual, a day that would be Ready is Ease off. Made-up
-- values only; dates are fixed in September 2026 so none can become "today".
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- The settings: version 3 is active and frozen, copies version 2, and adds only the floor.
select is((select version from public.score_settings where active), 3, 'version 3 is the active settings');
select is((select bool_and(frozen) from public.score_settings where version in (1, 2, 3)), true, 'versions 1 to 3 are frozen');
select is((select sleep_floor_spreads from public.score_settings where version = 3), 1.5, 'version 3 has a sleep floor of 1.5 spreads');
select is((select count(*)::int from public.score_settings where version in (1, 2) and sleep_floor_spreads is not null), 0,
  'versions 1 and 2 have no floor and stay as they were');
select is((select (v3.weights = v2.weights and v3.ease_off_at = v2.ease_off_at and v3.rest_at = v2.rest_at
                   and v3.window_nights = v2.window_nights and v3.min_valid_nights = v2.min_valid_nights
                   and v3.partial_cap is not distinct from v2.partial_cap)
             from public.score_settings v3, public.score_settings v2 where v3.version = 3 and v2.version = 2), true,
  'version 3 keeps version 2''s weights, zone limits and windows');
select throws_ok('update public.score_settings set sleep_floor_spreads = 1.0 where version = 3', 'P0001',
  'score settings version 3 is frozen', 'and version 3''s floor cannot change');

-- Seven made-up mornings.
insert into auth.users (id, email) values ('acacacac-acac-acac-acac-acacacacacac', 'user-floor@example.test');
insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                           sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count,
                           resting_hr_prev_day, coverage, confidence)
select 'acacacac-acac-acac-acac-acacacacacac', d, -300, d - interval '7 hours', d + interval '6 hours', asleep, true,
       sh, 60, h, case when h is null then 0 else 3 end, 15, 30, 58, 1, 'high'
  from (values
    (date '2026-09-01', 375::numeric, 50::numeric, 52::numeric),   -- sleep 1.62 spreads worse, the rest usual
    (date '2026-09-02', 379, 50, 52),                              -- sleep exactly 1.5 worse
    (date '2026-09-03', 383, 50, 52),                              -- sleep 1.38 worse: under the floor
    (date '2026-09-04', 375, 50, 40),                              -- sleep 1.62 worse and HRV low: Ease off by the points
    (date '2026-09-05', 375, 58, 32),                              -- all bad: Rest
    (date '2026-09-06', 375, 50, null),                            -- HRV missing, sleep 1.62 worse
    (date '2026-09-07', 375, 50, 52)                               -- sleep still building its normal, so not counted
  ) as v (d, asleep, sh, h);
insert into public.baselines (user_id, night_date, metric, median_28, mad_scaled, valid_nights, range_low, range_high, building)
select 'acacacac-acac-acac-acac-acacacacacac', d, m, med, sp, 42, med - 2 * sp, med + 2 * sp, (m = 'sleep' and d = date '2026-09-07')
  from generate_series(date '2026-09-01', date '2026-09-07', interval '1 day') as dd (d),
       (values ('hrv', 52, 6), ('sleep', 430, 34), ('sleeping_hr', 50, 2.5), ('resp_rate', 15, 0.5), ('resting_hr', 58, 2)) as x (m, med, sp);
select public.rebuild_status('acacacac-acac-acac-acac-acacacacacac', '2026-09-01', '2026-09-07');

create temp table s as select * from public.daily_status where user_id = 'acacacac-acac-acac-acac-acacacacacac';

select is((select status || '/' || sleep_floor || '/' || nudge || '/' || settings_version from s where date = '2026-09-01'),
  'ease_off/true/prioritise_sleep/3', '1.62 spreads below: Ease off by the floor, with the sleep nudge, under version 3');
select is((select status || '/' || sleep_floor from s where date = '2026-09-02'), 'ease_off/true',
  'exactly 1.5 spreads below fires the floor');
select is((select status || '/' || sleep_floor from s where date = '2026-09-03'), 'ready/false',
  '1.38 spreads below does not');
select is((select status || '/' || sleep_floor from s where date = '2026-09-04'), 'ease_off/false',
  'when the points already make Ease off, the floor did not decide it');
select is((select status || '/' || sleep_floor from s where date = '2026-09-05'), 'rest/false',
  'a Rest day stays Rest, the floor never changes it');
select is((select status || '/' || sleep_floor || '/' || readings_used from s where date = '2026-09-06'), 'ease_off/true/2',
  'a day from 2 of 3 readings can fire the floor too');
select is((select status || '/' || sleep_floor from s where date = '2026-09-07'), 'ready/false',
  'a sleep reading that is not counted never fires it');
select is((select round(total, 2) from s where date = '2026-09-01'), 0.40,
  'the points and total are unchanged: only the status moved');
select is((select count(*)::int from s where sleep_floor), 3, 'the floor fired on exactly the three mornings above');

-- Version 2 is untouched: the same mornings under it have no floor.
update public.score_settings set active = false where active;
update public.score_settings set active = true where version = 2;
select public.rebuild_status('acacacac-acac-acac-acac-acacacacacac', '2026-09-01', '2026-09-07');
select is((select status || '/' || sleep_floor || '/' || settings_version from public.daily_status
            where user_id = 'acacacac-acac-acac-acac-acacacacacac' and date = '2026-09-01'), 'ready/false/2',
  'under version 2 the 1.62 spreads morning is still Ready, as it was');
select is((select count(*)::int from public.daily_status
            where user_id = 'acacacac-acac-acac-acac-acacacacacac' and sleep_floor), 0, 'and nothing fires the floor');

-- The floor flag is private to the person like the rest of the row.
set local role authenticated;
select throws_ok($$update public.daily_status set sleep_floor = false$$, '42501', null, 'people cannot change the flag');
reset role;
select is((select count(*)::int from information_schema.columns
            where table_schema = 'public' and table_name = 'daily_status' and column_name = 'sleep_floor'), 1,
  'the flag is a column of daily_status');

select * from finish();
rollback;
