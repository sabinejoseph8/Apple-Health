-- Phase 2a: nights, normals and the analysis queue (docs/progress.md,
-- Phase 2 automated tests). Made-up readings only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'user-d@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'user-e@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'user-f@example.test');
-- Phase 6: uploads need consent (D79), so these made-up people have agreed.
insert into public.consents (user_id, version, agreed_use, agreed_us_storage) values
  ('44444444-4444-4444-4444-444444444444', 1, true, true),
  ('55555555-5555-5555-5555-555555555555', 1, true, true),
  ('66666666-6666-6666-6666-666666666666', 1, true, true);

-- One accepted upload to hang readings on, received now.
create table pg_temp.up as
select gen_random_uuid() as id;
insert into public.uploads (id, user_id, schema_version, kind, device_tz_offset_min, local_date, status)
select id, '44444444-4444-4444-4444-444444444444', 1, 'daily', -300, current_date, 'accepted' from pg_temp.up;

create function pg_temp.reading(p_type text, p_start timestamptz, p_end timestamptz, p_value numeric,
                                p_stage text, p_offset integer) returns void language sql as $$
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, stage, sample_hash)
  select '44444444-4444-4444-4444-444444444444', (select id from pg_temp.up), p_type, p_start, p_end, p_offset,
         p_value, p_stage, sha256(convert_to(gen_random_uuid()::text, 'UTF8'))
$$;

create function pg_temp.sleep(p_stage text, p_start timestamptz, p_end timestamptz, p_offset integer default -300)
returns void language sql as $$ select pg_temp.reading('sleep_stage', p_start, p_end, null, p_stage, p_offset) $$;

create function pg_temp.hr_every_15(p_start timestamptz, p_end timestamptz, p_value numeric, p_offset integer default -300)
returns void language sql as $$
  select pg_temp.reading('heart_rate', t, t, p_value, null, p_offset)
    from generate_series(p_start, p_end - interval '1 second', interval '15 minutes') as t
$$;

-- Night of 28 to 29 September (home, -05:00): core 11pm to 2am, awake 2am to
-- 2:30am, deep 2:30am to 4am, REM 4am to 6:30am, so 7 hours asleep.
select pg_temp.sleep('core', '2026-09-28 23:00-05', '2026-09-29 02:00-05');
select pg_temp.sleep('awake', '2026-09-29 02:00-05', '2026-09-29 02:30-05');
select pg_temp.sleep('deep', '2026-09-29 02:30-05', '2026-09-29 04:00-05');
select pg_temp.sleep('rem', '2026-09-29 04:00-05', '2026-09-29 06:30-05');
select pg_temp.sleep('in_bed', '2026-09-28 22:30-05', '2026-09-29 07:00-05');
select pg_temp.hr_every_15('2026-09-28 23:00-05', '2026-09-29 02:00-05', 50);  -- 12 readings
select pg_temp.hr_every_15('2026-09-29 02:30-05', '2026-09-29 06:30-05', 56);  -- 16 readings
select pg_temp.reading('heart_rate', '2026-09-29 02:10-05', '2026-09-29 02:10-05', 90, null, -300);  -- awake: left out
select pg_temp.reading('heart_rate', '2026-09-29 12:00-05', '2026-09-29 12:00-05', 100, null, -300); -- daytime: left out
select pg_temp.reading('hrv_sdnn', '2026-09-29 01:00-05', '2026-09-29 01:01-05', 40, null, -300);
select pg_temp.reading('hrv_sdnn', '2026-09-29 03:00-05', '2026-09-29 03:01-05', 50, null, -300);
select pg_temp.reading('hrv_sdnn', '2026-09-29 05:00-05', '2026-09-29 05:01-05', 60, null, -300);
select pg_temp.reading('hrv_sdnn', '2026-09-29 14:00-05', '2026-09-29 14:01-05', 99, null, -300);  -- daytime: left out
select pg_temp.reading('respiratory_rate', '2026-09-29 01:00-05', '2026-09-29 01:00-05', 14, null, -300);
select pg_temp.reading('respiratory_rate', '2026-09-29 04:00-05', '2026-09-29 04:00-05', 16, null, -300);
select pg_temp.reading('resting_hr', '2026-09-28 00:05-05', '2026-09-29 01:00-05', 57, null, -300);
-- An afternoon nap on the 29th: a separate, shorter sleep.
select pg_temp.sleep('core', '2026-09-29 15:00-05', '2026-09-29 15:45-05');

-- Night on a trip 8 hours ahead (+08:00): 11pm to 7am local, waking on
-- 2 October there (still 1 October at home). Only 5 heart rate readings.
select pg_temp.sleep('core', '2026-10-01 23:00+08', '2026-10-02 07:00+08', 480);
select pg_temp.reading('heart_rate', t, t, 60, null, 480)
  from generate_series(timestamptz '2026-10-01 23:30+08', '2026-10-02 01:30+08', interval '30 minutes') as t;

-- A 90-minute sleep on 3 October: too short to be a night.
select pg_temp.sleep('core', '2026-10-03 01:00-05', '2026-10-03 02:30-05');

-- 5 October: two sleeps 100 minutes apart are one night (D50: all sleep
-- from 6pm to noon counts, however long the break).
select pg_temp.sleep('core', '2026-10-04 22:00-05', '2026-10-05 01:00-05');
select pg_temp.sleep('core', '2026-10-05 02:40-05', '2026-10-05 06:40-05');
-- 6 October: two sleeps 80 minutes apart.
select pg_temp.sleep('core', '2026-10-05 22:00-05', '2026-10-06 01:00-05');
select pg_temp.sleep('deep', '2026-10-06 02:20-05', '2026-10-06 06:20-05');

select is((public.recompute('44444444-4444-4444-4444-444444444444', '2026-09-27', '2026-10-07') ->> 'nights')::int, 4,
  'four nights are built: 29 September, the trip night, 5 and 6 October');

create temp view n as select * from public.nights where user_id = '44444444-4444-4444-4444-444444444444';

select is((select asleep_min from n where night_date = '2026-09-29'), 420.0, 'sleep counts the asleep stages only (7 hours)');
select is((select sleep_start from n where night_date = '2026-09-29'), '2026-09-28 23:00-05'::timestamptz,
  'the sleep window starts with the first asleep stage, not "in bed"');
select is((select sleep_end from n where night_date = '2026-09-29'), '2026-09-29 06:30-05'::timestamptz,
  'the sleep window ends with the last asleep stage');
select is((select sleeping_hr_count from n where night_date = '2026-09-29'), 28,
  'sleeping heart rate uses only readings taken while asleep');
select is((select sleeping_hr from n where night_date = '2026-09-29'), 56::numeric,
  'sleeping heart rate is the median of those readings');
select is((select hrv_median from n where night_date = '2026-09-29'), 50::numeric, 'HRV is the median inside the sleep window');
select is((select hrv_count from n where night_date = '2026-09-29'), 3, 'daytime HRV is left out');
select is((select resp_rate from n where night_date = '2026-09-29'), 15::numeric, 'breathing rate is the median inside the window');
select is((select resting_hr_prev_day from n where night_date = '2026-09-29'), 57::numeric,
  'resting heart rate is Apple''s value for the day before waking');
select is((select coverage from n where night_date = '2026-09-29'), 1::numeric, 'every 15 minutes asleep had a heart rate reading');
select is((select confidence from n where night_date = '2026-09-29'), 'high', 'full coverage is high confidence');
select is((select finished from n where night_date = '2026-09-29'), true, 'a night that ended long before the last sync is finished');
select is((select count(*)::int from n where night_date = '2026-09-30'), 0, 'the afternoon nap is not a night');

select is((select count(*)::int from n where night_date = '2026-10-02'), 1,
  'a trip night is dated by the local date of waking where it happened');
select is((select tz_offset_min from n where night_date = '2026-10-02'), 480, 'the night keeps the offset it was recorded in');
select is((select sleeping_hr from n where night_date = '2026-10-02'), null,
  'sleeping heart rate needs at least 10 readings');
select is((select sleeping_hr_count from n where night_date = '2026-10-02'), 5, 'the 5 readings are still counted');

select is((select count(*)::int from n where night_date = '2026-10-03'), 0, 'a sleep under 2 hours is not a night');
select is((select asleep_min from n where night_date = '2026-10-05'), 420.0,
  'sleep before and after a break of more than 90 minutes is one night');
select is((select asleep_min from n where night_date = '2026-10-06'), 420.0, 'so is sleep around a shorter break');
select is((select sleep_start from n where night_date = '2026-10-06'), '2026-10-05 22:00-05'::timestamptz,
  'a night starts with its first stretch asleep');

-- Running it again gives the same result.
create temp table first_run as
select md5(string_agg(row(night_date, sleep_start, sleep_end, asleep_min, sleeping_hr, hrv_median, resp_rate,
                          resting_hr_prev_day, coverage, confidence, finished)::text, ',' order by night_date)) as h
  from n;
select public.recompute('44444444-4444-4444-4444-444444444444', '2026-09-27', '2026-10-07');
select is((select md5(string_agg(row(night_date, sleep_start, sleep_end, asleep_min, sleeping_hr, hrv_median, resp_rate,
                                     resting_hr_prev_day, coverage, confidence, finished)::text, ',' order by night_date)) from n),
          (select h from first_run), 'recomputing gives identical nights');

-- Normals, from nights made directly: 28 nights from 1 to 28 September with
-- HRV 1 to 28, breathing rate on 21 of them and sleeping heart rate on 20,
-- then the judged night (29 September) with an extreme HRV.
insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                           sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count, coverage, confidence)
select '55555555-5555-5555-5555-555555555555', date '2026-08-31' + i, -300, now(), now(), 400 + i, true,
       case when i <= 20 then 50 end, 20, i, 1, case when i <= 21 then 15 end, 1, 1, 'high'
  from generate_series(1, 28) as i;
insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                           sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count, coverage, confidence)
values ('55555555-5555-5555-5555-555555555555', '2026-09-29', -300, now(), now(), 300, true, 70, 20, 1000, 1, 15, 1, 1, 'high');
select public.rebuild_baselines('55555555-5555-5555-5555-555555555555', '2026-09-29', '2026-09-29');

create temp view b as
select * from public.baselines where user_id = '55555555-5555-5555-5555-555555555555' and night_date = '2026-09-29';
select is((select median_28 from b where metric = 'hrv'), 14.5::numeric,
  'the normal is the median of the 28 nights before, never the night judged');
select is((select round(mad_scaled, 4) from b where metric = 'hrv'), 10.3782::numeric, 'the spread is the MAD times 1.4826');
select is((select round(range_low, 4) || ' to ' || round(range_high, 4) from b where metric = 'hrv'), '-6.2564 to 35.2564',
  'the normal range is 2 spreads either side');
select is((select valid_nights from b where metric = 'hrv'), 28, 'all 28 nights had HRV');
select is((select building from b where metric = 'resp_rate'), false, '21 valid nights out of 28 is enough');
select is((select building from b where metric = 'sleeping_hr'), true, '20 valid nights is still building');
select is((select valid_nights from b where metric = 'sleeping_hr'), 20, 'nights without the reading are not counted');

-- The queue: posts queue work, the minute job processes it.
select public.issue_upload_token('66666666-6666-6666-6666-666666666666', repeat('9', 64));
select public.ingest_upload(repeat('9', 64), jsonb_build_object('schema_version', 1, 'kind', 'daily',
  'device_tz_offset_min', 0, 'samples', jsonb_build_array(jsonb_build_object(
    'type', 'sleep_stage', 'start_at', (current_date - 1)::timestamp at time zone 'utc' + interval '23 hours',
    'end_at', current_date::timestamp at time zone 'utc' + interval '6 hours',
    'tz_offset_min', 0, 'stage', 'core', 'source_name', 'Test Watch'))));
select is((select count(*)::int from public.analysis_queue
            where user_id = '66666666-6666-6666-6666-666666666666' and status = 'pending' and reason = 'daily' and send_push), 1,
  'a daily post queues a recalculation that may notify');
select is(public.run_analysis_queue() >= 1, true, 'the minute job processes the queue');
select is((select status from public.analysis_queue where user_id = '66666666-6666-6666-6666-666666666666'), 'done',
  'the queued work is marked done');
select is((select count(*)::int from public.nights where user_id = '66666666-6666-6666-6666-666666666666'), 1,
  'and the night was built');

select public.ingest_upload(repeat('9', 64), jsonb_build_object('schema_version', 1, 'kind', 'backfill', 'month_id',
  to_char(now() at time zone 'utc' - interval '1 month', 'YYYY-MM'), 'device_tz_offset_min', 0,
  'samples', jsonb_build_array(jsonb_build_object('type', 'heart_rate', 'start_at', now() - interval '35 days',
    'end_at', now() - interval '35 days', 'tz_offset_min', 0, 'value', 55, 'source_name', 'Test Watch'))));
select is((select send_push from public.analysis_queue
            where user_id = '66666666-6666-6666-6666-666666666666' and reason = 'backfill'), false,
  'an import never asks for a notification');
select public.run_analysis_queue();
select is((select status from public.analysis_queue
            where user_id = '66666666-6666-6666-6666-666666666666' and reason = 'backfill'), 'pending',
  'while an import is still arriving, its recalculation waits');
update public.analysis_queue set queued_at = now() - interval '3 minutes'
 where user_id = '66666666-6666-6666-6666-666666666666' and reason = 'backfill';
select public.run_analysis_queue();
select is((select status from public.analysis_queue
            where user_id = '66666666-6666-6666-6666-666666666666' and reason = 'backfill'), 'done',
  'once the import has stopped arriving, it is recalculated once');

-- Isolation.
set local role authenticated;
set local request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}';
select is((select count(distinct user_id)::int from public.nights), 1, 'a user sees only their own nights');
select throws_ok('delete from public.nights', '42501', null, 'nights cannot be changed directly');

reset role;
select * from finish();
rollback;
