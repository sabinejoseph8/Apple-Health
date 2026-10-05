-- Phase 2 code review fixes. Made-up data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Nobody but the server can run the analysis: each function refuses anon
-- and signed-in users (they would otherwise reach any account's results).
set local role anon;
select throws_ok($$select public.recompute('00000000-0000-0000-0000-000000000000', current_date, current_date)$$,
  '42501', null, 'anon cannot recompute');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "12121212-1212-1212-1212-121212121212", "role": "authenticated"}';
select throws_ok($$select public.recompute('00000000-0000-0000-0000-000000000000', current_date, current_date)$$,
  '42501', null, 'a signed-in user cannot recompute');
select throws_ok($$select public.rebuild_nights('00000000-0000-0000-0000-000000000000', current_date, current_date)$$,
  '42501', null, 'or rebuild nights');
select throws_ok($$select public.rebuild_baselines('00000000-0000-0000-0000-000000000000', current_date, current_date)$$,
  '42501', null, 'or normals');
select throws_ok($$select public.rebuild_status('00000000-0000-0000-0000-000000000000', current_date, current_date)$$,
  '42501', null, 'or statuses');
select throws_ok($$select public.run_analysis_queue()$$, '42501', null, 'or run the queue');
select throws_ok($$select public.active_score_settings()$$, '42501', null, 'or read the score settings (R40)');
select throws_ok($$select public.ingest_upload('x', '{}'::jsonb)$$, '42501', null, 'or store readings without the server');
select throws_ok($$select * from public.analysis_queue$$, '42501', null, 'or see the queue');
reset role;

-- A morning sync whose night hasn't arrived yet: "night not finished" today,
-- "not enough data" on an earlier day.
insert into auth.users (id, email) values ('12121212-1212-1212-1212-121212121212', 'user-q@example.test');
-- Phase 6: uploads need consent (D79), so these made-up people have agreed.
insert into public.consents (user_id, version, agreed_use, agreed_us_storage) values
  ('12121212-1212-1212-1212-121212121212', 1, true, true);
update public.profiles set latest_tz_offset_min = -300 where user_id = '12121212-1212-1212-1212-121212121212';
insert into public.uploads (user_id, schema_version, kind, device_tz_offset_min, local_date, status)
values ('12121212-1212-1212-1212-121212121212', 1, 'daily', -300,
        ((now() at time zone 'utc') - interval '5 hours')::date, 'accepted'),
       ('12121212-1212-1212-1212-121212121212', 1, 'daily', -300,
        ((now() at time zone 'utc') - interval '5 hours')::date - 3, 'accepted');
select public.rebuild_status('12121212-1212-1212-1212-121212121212',
                             ((now() at time zone 'utc') - interval '5 hours')::date - 5,
                             ((now() at time zone 'utc') - interval '5 hours')::date);
select is((select no_status_reason from public.daily_status
            where user_id = '12121212-1212-1212-1212-121212121212'
              and date = ((now() at time zone 'utc') - interval '5 hours')::date), 'night_unfinished',
  'today''s sync with no night yet: sleep still in progress');
select is((select no_status_reason from public.daily_status
            where user_id = '12121212-1212-1212-1212-121212121212'
              and date = ((now() at time zone 'utc') - interval '5 hours')::date - 3), 'not_enough_data',
  'an earlier day''s sync with no night: not enough data');

-- Failed work is tried again, up to 3 times. (Without active settings,
-- every recompute fails.)
insert into public.analysis_queue (user_id, from_date, to_date, reason)
values ('12121212-1212-1212-1212-121212121212', current_date - 1, current_date, 'manual');
update public.score_settings set active = false where active;
select public.run_analysis_queue();
select is((select status || '/' || attempts from public.analysis_queue
            where user_id = '12121212-1212-1212-1212-121212121212'), 'pending/1',
  'a failed recompute is kept for another try');
select is((select error from public.analysis_queue where user_id = '12121212-1212-1212-1212-121212121212'),
  'no active score settings', 'with the reason');
select public.run_analysis_queue();
select public.run_analysis_queue();
select is((select status || '/' || attempts from public.analysis_queue
            where user_id = '12121212-1212-1212-1212-121212121212'), 'failed/3',
  'after 3 attempts it is marked failed');
update public.score_settings set active = true where version = 2;
insert into public.analysis_queue (user_id, from_date, to_date, reason)
values ('12121212-1212-1212-1212-121212121212', current_date - 1, current_date, 'manual');
select public.run_analysis_queue();
select is((select count(*)::int from public.analysis_queue
            where user_id = '12121212-1212-1212-1212-121212121212' and status = 'done'), 1,
  'and work that can run again does');

-- Every reading needs a positive smallest spread.
select throws_ok($$insert into public.score_settings (version, weights, ease_off_at, rest_at, window_nights,
    min_valid_nights, min_spread, illness_spreads, illness_min_markers)
  values (50, '{"hrv": 0.4, "sleeping_hr": 0.35, "sleep": 0.25}', 1, 2, 28, 21,
          '{"hrv": 1, "sleeping_hr": 1, "sleep": 10}', 1, 3)$$, '23514', null,
  'settings without a smallest spread for every reading are refused');

-- The job log is trimmed daily, and the column notes say what they hold.
select is((select count(*)::int from cron.job where jobname = 'trim-cron-log'), 1, 'the job log is trimmed daily');
select isnt(col_description('public.baselines'::regclass,
  (select attnum from pg_attribute where attrelid = 'public.baselines'::regclass and attname = 'mad_scaled')), null,
  'the spread column says what it holds');
select isnt(col_description('public.baselines'::regclass,
  (select attnum from pg_attribute where attrelid = 'public.baselines'::regclass and attname = 'median_28')), null,
  'and so does the median column');

select * from finish();
rollback;
