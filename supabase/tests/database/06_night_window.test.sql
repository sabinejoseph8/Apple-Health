-- Phase 2a fix: a night is all the time asleep in stretches starting from
-- 6pm the evening before to noon, dated by that morning (D50). Made-up
-- readings only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user-j@example.test');

create table pg_temp.up as
select gen_random_uuid() as id;
insert into public.uploads (id, user_id, schema_version, kind, device_tz_offset_min, local_date, status)
select id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 'daily', -300, current_date, 'accepted' from pg_temp.up;

create function pg_temp.reading(p_type text, p_start timestamptz, p_end timestamptz, p_value numeric, p_stage text)
returns void language sql as $$
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, stage, sample_hash)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from pg_temp.up), p_type, p_start, p_end, -300,
         p_value, p_stage, sha256(convert_to(gen_random_uuid()::text, 'UTF8'))
$$;

create function pg_temp.sleep(p_stage text, p_start timestamptz, p_end timestamptz)
returns void language sql as $$ select pg_temp.reading('sleep_stage', p_start, p_end, null, p_stage) $$;

-- 12 October: asleep 6:30pm to 8pm the evening before, awake until 11:30pm,
-- asleep again 11:30pm to 5am. Heart rate every 15 minutes throughout.
select pg_temp.sleep('core', '2026-10-11 18:30-05', '2026-10-11 20:00-05');
select pg_temp.sleep('awake', '2026-10-11 20:00-05', '2026-10-11 23:30-05');
select pg_temp.sleep('core', '2026-10-11 23:30-05', '2026-10-12 05:00-05');
select pg_temp.reading('heart_rate', t, t, 55, null)
  from generate_series(timestamptz '2026-10-11 18:30-05', '2026-10-12 04:59-05', interval '15 minutes') as t;

-- 13 October: no night, only a 2.5-hour nap from 1pm to 3:30pm.
select pg_temp.sleep('deep', '2026-10-13 13:00-05', '2026-10-13 15:30-05');

-- 15 October: asleep 11pm to 3am, then again 11am to 1pm (a sleep-in that
-- starts before noon and ends after it).
select pg_temp.sleep('core', '2026-10-14 23:00-05', '2026-10-15 03:00-05');
select pg_temp.sleep('rem', '2026-10-15 11:00-05', '2026-10-15 13:00-05');

select is((public.recompute('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-11', '2026-10-16') ->> 'nights')::int, 2,
  'two nights are built: 12 and 15 October');

create temp view n as select * from public.nights where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is((select asleep_min from n where night_date = '2026-10-12'), 420.0,
  'sleep from 6pm the evening before counts towards the next morning''s night');
select is((select sleep_start from n where night_date = '2026-10-12'), '2026-10-11 18:30-05'::timestamptz,
  'the night starts with its first stretch asleep, however long the break after it');
select is((select sleeping_hr_count from n where night_date = '2026-10-12'), 28,
  'heart rate during the break is left out (6 readings before it, 22 after)');
select is((select count(*)::int from n where night_date in ('2026-10-13', '2026-10-14')), 0,
  'sleep starting between noon and 6pm is a nap, even when it lasts over 2 hours');
select is((select asleep_min from n where night_date = '2026-10-15'), 360.0,
  'a stretch starting before noon counts in full');
select is((select sleep_end from n where night_date = '2026-10-15'), '2026-10-15 13:00-05'::timestamptz,
  'and the night ends when it does');

-- Running it again gives the same result.
create temp table first_run as
select md5(string_agg(row(night_date, sleep_start, sleep_end, asleep_min, sleeping_hr_count)::text, ',' order by night_date)) as h
  from n;
select public.recompute('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-11', '2026-10-16');
select is((select md5(string_agg(row(night_date, sleep_start, sleep_end, asleep_min, sleeping_hr_count)::text, ',' order by night_date)) from n),
          (select h from first_run), 'recomputing gives identical nights');

select * from finish();
rollback;
