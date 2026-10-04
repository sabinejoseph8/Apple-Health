-- Phase 2a fix: overlapping sleep records (D49). When two records cover the
-- same time, each moment counts once, and awake wins over asleep. The
-- night is all the time asleep from 6pm to noon (D50). Made-up readings
-- only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'user-h@example.test');

create table pg_temp.up as
select gen_random_uuid() as id;
insert into public.uploads (id, user_id, schema_version, kind, device_tz_offset_min, local_date, status)
select id, '88888888-8888-8888-8888-888888888888', 1, 'daily', -300, current_date, 'accepted' from pg_temp.up;

create function pg_temp.reading(p_type text, p_start timestamptz, p_end timestamptz, p_value numeric, p_stage text)
returns void language sql as $$
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, stage, sample_hash)
  select '88888888-8888-8888-8888-888888888888', (select id from pg_temp.up), p_type, p_start, p_end, -300,
         p_value, p_stage, sha256(convert_to(gen_random_uuid()::text, 'UTF8'))
$$;

create function pg_temp.sleep(p_stage text, p_start timestamptz, p_end timestamptz)
returns void language sql as $$ select pg_temp.reading('sleep_stage', p_start, p_end, null, p_stage) $$;

create function pg_temp.hr_every_15(p_start timestamptz, p_end timestamptz, p_value numeric)
returns void language sql as $$
  select pg_temp.reading('heart_rate', t, t, p_value, null)
    from generate_series(p_start, p_end - interval '1 second', interval '15 minutes') as t
$$;

-- 8 October: the Watch's stages (core 11pm to 1am, awake 1am to 1:30am, deep
-- 1:30am to 3am, REM 3am to 6am: 6.5 hours asleep), with a second record on
-- top of them: one "deep" stage from 11pm to 6am, as in December 2025.
select pg_temp.sleep('core', '2026-10-07 23:00-05', '2026-10-08 01:00-05');
select pg_temp.sleep('awake', '2026-10-08 01:00-05', '2026-10-08 01:30-05');
select pg_temp.sleep('deep', '2026-10-08 01:30-05', '2026-10-08 03:00-05');
select pg_temp.sleep('rem', '2026-10-08 03:00-05', '2026-10-08 06:00-05');
select pg_temp.sleep('deep', '2026-10-07 23:00-05', '2026-10-08 06:00-05');
select pg_temp.hr_every_15('2026-10-07 23:00-05', '2026-10-08 06:00-05', 55);  -- 28 readings, 2 while awake

-- 10 October: the same stretch recorded as asleep and as awake, as in July
-- 2026. Core 11pm to 2am; then core 2am to 4:30am, but also core 2am to
-- 2:05am and awake 2:05am to 4:10am; then core 4:10am to 7am. Awake wins, so
-- there are 125 minutes awake between 11pm to 2:05am (185 minutes) and
-- 4:10am to 7am (170 minutes).
select pg_temp.sleep('core', '2026-10-09 23:00-05', '2026-10-10 02:00-05');
select pg_temp.sleep('core', '2026-10-10 02:00-05', '2026-10-10 04:30-05');
select pg_temp.sleep('core', '2026-10-10 02:00-05', '2026-10-10 02:05-05');
select pg_temp.sleep('awake', '2026-10-10 02:05-05', '2026-10-10 04:10-05');
select pg_temp.sleep('core', '2026-10-10 04:10-05', '2026-10-10 07:00-05');

select is((public.recompute('88888888-8888-8888-8888-888888888888', '2026-10-07', '2026-10-11') ->> 'nights')::int, 2,
  'two nights are built');

create temp view n as select * from public.nights where user_id = '88888888-8888-8888-8888-888888888888';

select is((select asleep_min from n where night_date = '2026-10-08'), 390.0,
  'time covered by two records counts once, and awake wins (6.5 hours, not 13.5)');
select ok((select sleep_start = '2026-10-07 23:00-05' and sleep_end = '2026-10-08 06:00-05' from n where night_date = '2026-10-08'),
  'the sleep window is unchanged by the second record');
select is((select sleeping_hr_count from n where night_date = '2026-10-08'), 26,
  'heart rate taken while the Watch said awake is left out, even under the second record');
select is((select coverage from n where night_date = '2026-10-08'), 1::numeric,
  'coverage is measured against the time asleep counted once');

select is((select asleep_min from n where night_date = '2026-10-10'), 355.0,
  'the time recorded as both asleep and awake is left out, and the rest of the night counts');
select is((select sleep_end from n where night_date = '2026-10-10'), '2026-10-10 07:00-05'::timestamptz,
  'the night ends with its last stretch asleep');
select is((select tz_offset_min from n where night_date = '2026-10-10'), -300,
  'it keeps the offset it was recorded in');

-- Nights without overlaps are unchanged: 29 September's night from the
-- 2a tests, rebuilt here for a second user, still comes to 420 minutes.
insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'user-i@example.test');
insert into public.uploads (id, user_id, schema_version, kind, device_tz_offset_min, local_date, status)
values ('99999999-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 1, 'daily', -300, current_date, 'accepted');
insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, stage, sample_hash)
select '99999999-9999-9999-9999-999999999999', '99999999-0000-0000-0000-000000000001', 'sleep_stage', a, b, -300, st,
       sha256(convert_to(gen_random_uuid()::text, 'UTF8'))
  from (values ('core', timestamptz '2026-09-28 23:00-05', timestamptz '2026-09-29 02:00-05'),
               ('awake', '2026-09-29 02:00-05', '2026-09-29 02:30-05'),
               ('deep', '2026-09-29 02:30-05', '2026-09-29 04:00-05'),
               ('rem', '2026-09-29 04:00-05', '2026-09-29 06:30-05'),
               ('in_bed', '2026-09-28 22:30-05', '2026-09-29 07:00-05')) as v (st, a, b);
select public.recompute('99999999-9999-9999-9999-999999999999', '2026-09-28', '2026-09-30');
select is((select asleep_min from public.nights where user_id = '99999999-9999-9999-9999-999999999999'), 420.0,
  'a night without overlaps is unchanged');

select * from finish();
rollback;
