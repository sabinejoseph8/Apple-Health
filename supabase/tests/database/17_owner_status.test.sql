-- Phase 5: the owner's status page (R64). The owner sees each person's
-- syncs, reminders, failures and import progress, and no health value; a
-- tester is refused. Made-up accounts only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_app_meta_data) values
  ('71717171-7171-7171-7171-717171717171', 'owner-y@example.test', '{"is_owner": true}'),
  ('72727272-7272-7272-7272-727272727272', 'tester-z@example.test', '{}');

-- Tester Z: a sync, reminders on two days in a row, a failed notification,
-- and five of twelve months imported.
insert into public.uploads (user_id, received_at, schema_version, kind, device_tz_offset_min, local_date, status)
values ('72727272-7272-7272-7272-727272727272', now() - interval '1 day', 1, 'daily', -300, current_date - 1, 'accepted');
insert into public.uploads (user_id, schema_version, kind, month_id, month_complete, device_tz_offset_min, local_date, status)
select '72727272-7272-7272-7272-727272727272', 1, 'backfill', to_char(current_date - (k || ' months')::interval, 'YYYY-MM'), true, -300,
       current_date, 'accepted'
  from generate_series(0, 4) as k;
insert into public.notifications (user_id, date, kind, status, expires_at) values
  ('72727272-7272-7272-7272-727272727272', current_date - 2, 'reminder', 'sent', now()),
  ('72727272-7272-7272-7272-727272727272', current_date - 1, 'reminder', 'sent', now()),
  ('72727272-7272-7272-7272-727272727272', current_date - 1, 'morning', 'failed', now());
-- And some health data, which must never appear.
insert into public.daily_status (user_id, date, status, readings_used, points, total, nudge, settings_version)
values ('72727272-7272-7272-7272-727272727272', current_date - 1, 'ease_off', 3,
        '{"hrv": {"value": 38, "normal": 52, "verdict": "below"}}', 1.6, 'train_easy', 2);

set local role authenticated;
set local request.jwt.claims = '{"sub": "71717171-7171-7171-7171-717171717171", "role": "authenticated"}';
create temp table s as select public.owner_status() as status;
create temp table z as select p as person from s, jsonb_array_elements(status -> 'people') as p where p ->> 'name' = 'tester-z@example.test';

select is((select jsonb_array_length(status -> 'people') from s), 2, 'the owner sees every person');
select isnt((select person ->> 'last_sync' from z), null, 'with their last successful sync');
select is((select jsonb_array_length(person -> 'reminder_days') from z), 2, 'the days that needed the 11:30 reminder');
select is((select (person ->> 'reminders_in_a_row')::boolean from z), true, 'flagged after two in a row');
select is((select (person ->> 'failures')::int from z), 1, 'failed notifications in the last two days');
select is((select (person ->> 'import_months')::int from z), 5, 'import progress: 5 of 12 months');
select ok((select (status ->> 'database_mb')::numeric > 0 from s), 'and how full the database is');
-- No status, nudge, reading name or reading field anywhere (numbers alone
-- can't be checked: a sync time or the database size may contain them).
select ok((select status::text !~ '(ease_off|train_easy|hrv|points|verdict|"value"|normal)' from s), 'and no health value at all');

set local request.jwt.claims = '{"sub": "72727272-7272-7272-7272-727272727272", "role": "authenticated"}';
select throws_ok($$select public.owner_status()$$, '42501', 'only the owner can see this', 'a tester is refused');
reset role;
set local role anon;
select throws_ok($$select public.owner_status()$$, '42501', null, 'and so is anyone not signed in');
reset role;

select * from finish();
rollback;
