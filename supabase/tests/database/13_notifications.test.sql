-- Phase 4: the outbox, the morning notification, the 11:30 reminder and 8pm
-- question, what was shown (D61) and follow-through answers (R47 to R56,
-- D67). Made-up accounts in UTC-5; times are given as moments for the tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users (id, email) values
  ('41414141-4141-4141-4141-414141414141', 'tester-r@example.test'),
  ('42424242-4242-4242-4242-424242424242', 'tester-s@example.test');
update public.profiles set latest_tz_offset_min = -300
 where user_id in ('41414141-4141-4141-4141-414141414141', '42424242-4242-4242-4242-424242424242');

-- A day's status for tester R (made-up points; only the status matters here).
create function pg_temp.status(p_date date, p_status text, p_nudge text) returns void language sql as $$
  insert into public.daily_status (user_id, date, status, no_status_reason, readings_used, points, total, nudge, settings_version)
  values ('41414141-4141-4141-4141-414141414141', p_date, p_status,
          case when p_status = 'none' then 'not_enough_data' end, 3, '{}', 1.6, p_nudge, 2)
  on conflict (user_id, date) do update set status = excluded.status, nudge = excluded.nudge,
    no_status_reason = excluded.no_status_reason
$$;
-- An accepted morning sync at a moment.
create function pg_temp.sync(p_user uuid, p_at timestamptz, p_complete boolean default true) returns void language sql as $$
  insert into public.uploads (user_id, received_at, schema_version, kind, device_tz_offset_min, local_date, night_complete, status)
  values (p_user, p_at, 1, 'daily', -300, ((p_at at time zone 'utc') - interval '5 hours')::date, p_complete, 'accepted')
$$;

-- The morning notification (R48): queued once, on a day with a status, from
-- a sync before local noon.
select pg_temp.status('2026-09-29', 'ease_off', 'train_easy');
select pg_temp.sync('41414141-4141-4141-4141-414141414141', '2026-09-29 06:42-05');
select is(public.queue_morning_notification('41414141-4141-4141-4141-414141414141', '2026-09-29 06:44-05'), true,
  'a morning with a status queues the morning notification');
select is(public.queue_morning_notification('41414141-4141-4141-4141-414141414141', '2026-09-29 07:30-05'), false,
  'running the analysis again does not queue a second one');
select is((select count(*)::int from public.notifications where kind = 'morning'), 1, 'so there is one');
select is((select expires_at from public.notifications where kind = 'morning'), '2026-09-29 12:00-05'::timestamptz,
  'and it is not sent after local noon');

select pg_temp.status('2026-09-30', 'none', null);
select pg_temp.sync('41414141-4141-4141-4141-414141414141', '2026-09-30 06:42-05');
select is(public.queue_morning_notification('41414141-4141-4141-4141-414141414141', '2026-09-30 06:44-05'), false,
  'a day without a status sends none (R48)');

select pg_temp.status('2026-10-01', 'rest', 'rest');
select pg_temp.sync('41414141-4141-4141-4141-414141414141', '2026-10-01 12:20-05');
select is(public.queue_morning_notification('41414141-4141-4141-4141-414141414141', '2026-10-01 12:22-05'), false,
  'a sync after noon sends none (R29)');

select pg_temp.status('2026-10-02', 'ease_off', 'train_easy');
select pg_temp.sync('41414141-4141-4141-4141-414141414141', '2026-10-02 11:45-05');
select is(public.queue_morning_notification('41414141-4141-4141-4141-414141414141', '2026-10-02 11:47-05'), true,
  'a late sync before noon still sends the morning notification (R28)');

-- The 11:30 reminder (R49, D34), for people who sync.
select pg_temp.sync('41414141-4141-4141-4141-414141414141', '2026-09-15 07:00-05');
select pg_temp.sync('42424242-4242-4242-4242-424242424242', '2026-09-15 07:00-05');
select is(public.plan_notifications('2026-09-20 11:29-05'), 0, 'no reminder before 11:30');
select is(public.plan_notifications('2026-09-20 11:30-05'), 2, 'at 11:30, a reminder to each person with no sync yet');
select is(public.plan_notifications('2026-09-20 11:35-05'), 0, 'and only one each');
select is((select expires_at from public.notifications where kind = 'reminder' and user_id = '41414141-4141-4141-4141-414141414141'),
  '2026-09-20 12:00-05'::timestamptz, 'it is not sent after noon');
select pg_temp.sync('42424242-4242-4242-4242-424242424242', '2026-09-21 07:00-05');
select is(public.plan_notifications('2026-09-21 11:31-05'), 1, 'someone who synced that morning gets no reminder');
select is((select user_id from public.notifications where kind = 'reminder' and date = '2026-09-21'),
  '41414141-4141-4141-4141-414141414141'::uuid, 'only the one who did not');

-- The 8pm question (R50, D32): from what was shown, on change days only.
insert into public.shown_status (user_id, date, via, status, nudge, readings_used, settings_version)
values ('41414141-4141-4141-4141-414141414141', '2026-09-29', 'notification', 'ease_off', 'train_easy', 3, 2),
       ('42424242-4242-4242-4242-424242424242', '2026-09-29', 'card', 'ready', 'train_as_planned', 3, 2);
select is(public.plan_notifications('2026-09-29 19:59-05'), 0, 'no question at 7:59pm');
select is(public.plan_notifications('2026-09-29 20:00-05'), 1, 'at 8pm, one question');
select is((select user_id from public.notifications where kind = 'followup'), '41414141-4141-4141-4141-414141414141'::uuid,
  'to the person whose nudge asked for a change, not a train-as-planned day');
select is(public.plan_notifications('2026-09-29 21:00-05'), 0, 'and only once');
insert into public.shown_status (user_id, date, via, status, nudge, readings_used, settings_version)
values ('41414141-4141-4141-4141-414141414141', '2026-09-28', 'card', 'rest', 'rest', 3, 2);
insert into public.followthrough (user_id, date, answer, channel)
values ('41414141-4141-4141-4141-414141414141', '2026-09-28', 'yes', 'card');
select is(public.plan_notifications('2026-09-28 20:05-05'), 0, 'no question for a day already answered on the card');
select is((select expires_at from public.notifications where kind = 'followup'), '2026-09-30 00:00-05'::timestamptz,
  'it is not sent after midnight');

-- The answer window (D67): from 8pm on the change day until noon the next.
select is(public.followthrough_open('41414141-4141-4141-4141-414141414141', '2026-09-29', '2026-09-29 19:59-05'), false,
  'answers are refused before 8pm (R52)');
select is(public.followthrough_open('41414141-4141-4141-4141-414141414141', '2026-09-29', '2026-09-29 20:00-05'), true,
  'accepted from 8pm');
select is(public.followthrough_open('41414141-4141-4141-4141-414141414141', '2026-09-29', '2026-09-30 11:59-05'), true,
  'and the next morning (R55)');
select is(public.followthrough_open('41414141-4141-4141-4141-414141414141', '2026-09-29', '2026-09-30 12:00-05'), false,
  'but not from noon the next day (D67)');
select is(public.followthrough_open('42424242-4242-4242-4242-424242424242', '2026-09-29', '2026-09-29 21:00-05'), false,
  'and never on a train-as-planned day');

-- The sender claims due notifications once; anything past its time expires.
select is((select count(*)::int from public.claim_due_notifications()), 0,
  'everything queued for those days is past its time');
select is((select count(*)::int from public.notifications where status = 'expired'), 6, 'so it is marked expired, not sent');
insert into public.notifications (user_id, date, kind, expires_at)
values ('41414141-4141-4141-4141-414141414141', current_date + 1, 'morning', now() + interval '1 hour');
select is((select count(*)::int from public.claim_due_notifications()), 1, 'a due notification is claimed');
select is((select count(*)::int from public.claim_due_notifications()), 0, 'and never claimed twice');
select is(public.send_due_notifications(), null, 'with nothing pending, the sender is not called');
update public.notifications set claimed_at = now() - interval '6 minutes' where status = 'sending';
select is((select count(*)::int from public.claim_due_notifications()), 0, 'a send left unfinished is not sent again');
select is((select status || ' ' || error from public.notifications where date = current_date + 1), 'failed sender_stopped',
  'it is marked failed instead (at most one, R48)');

-- Signed in: what was shown, answers and taps.
set local role authenticated;
set local request.jwt.claims = '{"sub": "41414141-4141-4141-4141-414141414141", "role": "authenticated"}';
select lives_ok($$select public.record_shown('2026-09-29')$$, 'the card records what it showed');
select lives_ok($$select public.record_shown('2026-09-29')$$, 'again');
select is((select count(*)::int from public.shown_status where via = 'card' and date = '2026-09-29'), 1, 'once, never overwritten (D61)');
select lives_ok($$select public.record_shown('2026-09-30')$$, 'a day without a status');
select is((select count(*)::int from public.shown_status where date = '2026-09-30'), 0, 'records nothing');
select throws_ok($$select public.submit_followthrough('2026-09-29', 'maybe', 'card')$$, '22023', 'unknown answer',
  'an unknown answer is refused');
select throws_ok($$select public.submit_followthrough('2026-09-30', 'yes', 'card')$$, '22023',
  'no change was asked for that day', 'an answer for a day without a change nudge is refused');
select throws_ok($$select public.submit_followthrough('2026-09-29', 'yes', 'card')$$, '22023',
  'outside the time to answer', 'an answer days later is refused');
select throws_ok($$insert into public.followthrough (user_id, date, answer, channel)
  values ('41414141-4141-4141-4141-414141414141', '2026-09-29', 'yes', 'card')$$, '42501', null,
  'answers cannot be written directly');
select lives_ok($$select public.log_notification_tap((select id from public.notifications where kind = 'morning' and date = '2026-09-29'))$$,
  'a tap is recorded');
select isnt((select tapped_at from public.notifications where kind = 'morning' and date = '2026-09-29'), null, 'with its time');

-- Another tester sees none of it.
set local request.jwt.claims = '{"sub": "42424242-4242-4242-4242-424242424242", "role": "authenticated"}';
select is((select count(*)::int from public.notifications where user_id = '41414141-4141-4141-4141-414141414141'), 0,
  'another tester sees none of the notifications, shown status or answers');
reset role;

select * from finish();
rollback;
