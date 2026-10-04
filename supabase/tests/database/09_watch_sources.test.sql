-- Phase 2c: only Watch readings count (R15, D56), and two watches on one day
-- give the median resting heart rate (D57). Made-up readings only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'user-o@example.test');
insert into public.uploads (id, user_id, schema_version, kind, device_tz_offset_min, local_date, status)
values ('ffffffff-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 1, 'daily', -300, current_date, 'accepted');

create function pg_temp.reading(p_type text, p_start timestamptz, p_end timestamptz, p_value numeric, p_stage text,
                                p_source text) returns void language sql as $$
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, stage, source_name, sample_hash)
  values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'ffffffff-0000-0000-0000-000000000001', p_type, p_start, p_end, -300,
          p_value, p_stage, p_source, sha256(convert_to(gen_random_uuid()::text, 'UTF8')))
$$;

-- Night of 9 to 10 March, with heart rate from two watches.
select pg_temp.reading('sleep_stage', '2026-03-09 23:00-05', '2026-03-10 06:00-05', null, 'core', null);
select pg_temp.reading('heart_rate', t, t, 55, null, case when extract(minute from t) < 30 then 'Ultra Watch' else 'Second Watch' end)
  from generate_series(timestamptz '2026-03-09 23:00-05', '2026-03-10 05:45-05', interval '15 minutes') as t;
-- HRV from a watch and from an app; breathing rate from a watch and the iPhone.
select pg_temp.reading('hrv_sdnn', '2026-03-10 01:00-05', '2026-03-10 01:01-05', 40, null, 'Ultra Watch');
select pg_temp.reading('hrv_sdnn', '2026-03-10 02:00-05', '2026-03-10 02:01-05', 90, null, 'Athlytic');
select pg_temp.reading('respiratory_rate', '2026-03-10 03:00-05', '2026-03-10 03:00-05', 15, null, 'Second Watch');
select pg_temp.reading('respiratory_rate', '2026-03-10 04:00-05', '2026-03-10 04:00-05', 25, null, 'iPhone');
-- Resting heart rate for 9 March from both watches and the app.
select pg_temp.reading('resting_hr', '2026-03-09 00:00-05', '2026-03-09 23:55-05', 64, null, 'Ultra Watch');
select pg_temp.reading('resting_hr', '2026-03-09 00:00-05', '2026-03-09 23:55-05', 58, null, 'Second Watch');
select pg_temp.reading('resting_hr', '2026-03-09 00:00-05', '2026-03-09 23:55-05', 70, null, 'Athlytic');

select public.recompute('ffffffff-ffff-ffff-ffff-ffffffffffff', '2026-03-09', '2026-03-11');
create temp view n as select * from public.nights
 where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and night_date = '2026-03-10';

select is((select sleeping_hr_count from n), 28, 'heart rate from both watches counts');
select is((select hrv_median || '/' || hrv_count from n), '40/1', 'HRV from an app is left out');
select is((select resp_rate || '/' || resp_count from n), '15/1', 'breathing rate from the iPhone is left out');
select is((select resting_hr_prev_day from n), 61::numeric,
  'two watches'' resting heart rates for one day give their median; the app''s is left out');

-- Without any watch heart rate, readings with no source still count.
delete from public.samples where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and type in ('heart_rate', 'resting_hr');
select pg_temp.reading('resting_hr', '2026-03-09 00:00-05', '2026-03-09 23:55-05', 58, null, null);
select public.recompute('ffffffff-ffff-ffff-ffff-ffffffffffff', '2026-03-09', '2026-03-11');
select is((select resting_hr_prev_day from n), 58::numeric, 'a reading with no source is kept');

select * from finish();
rollback;
