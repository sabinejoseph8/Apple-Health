-- Phase 2c: the final score numbers, version 2 (D59). Made-up values only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select version from public.score_settings where active), 2, 'version 2 is the active settings');
select is((select window_nights || '/' || min_valid_nights || '/' || ease_off_at || '/' || rest_at
             from public.score_settings where version = 2), '42/21/1.2/2.4',
  'normals from 42 nights with 21 valid; Ease off from 1.2, Rest from 2.4');
select is((select weights from public.score_settings where version = 2),
          '{"hrv": 0.40, "sleeping_hr": 0.35, "sleep": 0.25}'::jsonb, 'the weights are unchanged');
select is((select bool_and(frozen) from public.score_settings where version in (1, 2)), true, 'versions 1 and 2 are frozen');
select throws_ok('update public.score_settings set ease_off_at = 1.1 where version = 2', 'P0001',
  'score settings version 2 is frozen', 'version 2''s numbers cannot change');
select lives_ok('update public.score_settings set active = false where version = 2', 'but a later version could replace it');
update public.score_settings set active = true where version = 2;

-- The design's sample day under version 2, from made-up nights and normals.
insert into auth.users (id, email) values ('abababab-abab-abab-abab-abababababab', 'user-p@example.test');
insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                           sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count,
                           resting_hr_prev_day, coverage, confidence)
select 'abababab-abab-abab-abab-abababababab', d, -300, d - interval '7 hours', d + interval '6 hours', 352, true,
       51, 60, h, case when h is null then 0 else 3 end, 15, 30, 58, 1, 'high'
  from (values (date '2026-09-29', 38::numeric), (date '2026-09-30', null)) as v (d, h);
insert into public.baselines (user_id, night_date, metric, median_28, mad_scaled, valid_nights, range_low, range_high, building)
select 'abababab-abab-abab-abab-abababababab', d, m, med, sp, 42, med - 2 * sp, med + 2 * sp, false
  from (values (date '2026-09-29'), (date '2026-09-30')) as dd (d),
       (values ('hrv', 52, 6), ('sleep', 430, 34), ('sleeping_hr', 50, 2.5), ('resp_rate', 15, 0.5), ('resting_hr', 58, 2)) as x (m, med, sp);
select public.rebuild_status('abababab-abab-abab-abab-abababababab', '2026-09-29', '2026-09-30');
select is((select status || '/' || settings_version from public.daily_status
            where user_id = 'abababab-abab-abab-abab-abababababab' and date = '2026-09-29'), 'ease_off/2',
  'the sample day (1.6) is still Ease off');
select is((select status from public.daily_status
            where user_id = 'abababab-abab-abab-abab-abababababab' and date = '2026-09-30'), 'ready',
  'with HRV missing (1.19), it is now Ready, under the new Ease off line of 1.2');
select is((select round(total, 2) from public.daily_status
            where user_id = 'abababab-abab-abab-abab-abababababab' and date = '2026-09-30'), 1.19, 'the points are unchanged');

select * from finish();
rollback;
