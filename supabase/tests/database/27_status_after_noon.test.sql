-- D119: a status whose night arrived after noon is recorded as shown with no
-- nudge, so it never becomes a change day (no 8pm question, no follow-through
-- answer). Made-up accounts in UTC-5.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'after-noon-a@example.test'),
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'after-noon-b@example.test');
update public.profiles set latest_tz_offset_min = -300
 where user_id in ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2');

create function pg_temp.status(p_date date, p_nudge text) returns void language sql as $$
  insert into public.daily_status (user_id, date, status, readings_used, points, total, nudge, settings_version)
  values ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', p_date, 'ease_off', 3, '{}', 1.6, p_nudge, 2)
$$;
create function pg_temp.sync(p_at timestamptz, p_complete boolean default true) returns void language sql as $$
  insert into public.uploads (user_id, received_at, schema_version, kind, device_tz_offset_min, local_date, night_complete, status)
  values ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', p_at, 1, 'daily', -300,
          ((p_at at time zone 'utc') - interval '5 hours')::date, p_complete, 'accepted')
$$;

-- 2 November: the night came in at 9am. 3 November: it came in at 2:10pm.
-- 4 November: a partial post at 9am, the night completed at 12:30pm.
-- 5 November: the night came in at 11:59am.
select pg_temp.status('2026-11-02', 'train_easy');
select pg_temp.sync('2026-11-02 09:00-05');
select pg_temp.status('2026-11-03', 'train_easy');
select pg_temp.sync('2026-11-03 14:10-05');
select pg_temp.status('2026-11-04', 'prioritise_sleep');
select pg_temp.sync('2026-11-04 09:00-05', false);
select pg_temp.sync('2026-11-04 12:30-05');
select pg_temp.status('2026-11-05', 'train_easy');
select pg_temp.sync('2026-11-05 11:59-05');

select is(public.synced_after_noon('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '2026-11-02'), false, 'a night in by 9am is before noon');
select is(public.synced_after_noon('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '2026-11-03'), true, 'a night in at 2:10pm is after noon');
select is(public.synced_after_noon('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '2026-11-04'), true,
  'the sync that completed the night counts, not an earlier partial one');
select is(public.synced_after_noon('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '2026-11-05'), false, '11:59am is still before noon');

set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1", "role": "authenticated"}';
select public.record_shown('2026-11-02');
select public.record_shown('2026-11-03');
select public.record_shown('2026-11-04');
select public.record_shown('2026-11-05');
reset role;

select is((select nudge from public.shown_status where date = '2026-11-02' and via = 'card'), 'train_easy',
  'a status shown from a night in before noon keeps its nudge');
select is((select status || '/' || coalesce(nudge, 'none') from public.shown_status where date = '2026-11-03' and via = 'card'),
  'ease_off/none', 'a status from a night after noon is shown, with no nudge (D119)');
select is((select coalesce(nudge, 'none') from public.shown_status where date = '2026-11-04' and via = 'card'), 'none',
  'and so is one whose night was completed after noon');
select is(public.shown_change_nudge('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '2026-11-03'), null,
  'so the day is not a change day');
select is(public.followthrough_open('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '2026-11-03', '2026-11-03 20:30-05'), false,
  'and no 8pm question opens for it');

set local role authenticated;
set local request.jwt.claims = '{"sub": "e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2", "role": "authenticated"}';
select throws_ok($$select public.synced_after_noon('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', '2026-11-03')$$, '42501', null,
  'a signed-in person cannot ask about anyone''s syncs');
reset role;

select * from finish();
rollback;
