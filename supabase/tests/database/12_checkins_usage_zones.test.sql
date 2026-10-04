-- Phase 3: check-ins (R16 to R19), the usage log (R43) and the zone numbers
-- for Why today (R40, D62). Made-up accounts only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('31313131-3131-3131-3131-313131313131', 'tester-p@example.test'),
  ('32323232-3232-3232-3232-323232323232', 'tester-q@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub": "31313131-3131-3131-3131-313131313131", "role": "authenticated"}';

-- Check-ins.
select lives_ok($$select public.submit_checkin((now() at time zone 'utc')::date, 'okay')$$, 'a tester checks in');
select is((select count(*)::int from public.checkins), 1, 'the answer is saved');
select is((select is_first from public.checkins), true, 'as the first answer of the day');
select is((select status_seen_before from public.checkins), false, 'given before the status was seen');

-- The card is shown with a status, then the answer is changed.
select lives_ok($$select public.log_usage('card_view',
  jsonb_build_object('date', (now() at time zone 'utc')::date::text, 'status_shown', true, 'state', 'status'))$$,
  'a card view is logged');
select lives_ok($$select public.submit_checkin((now() at time zone 'utc')::date, 'off')$$, 'the answer is changed');
select is((select count(*)::int from public.checkins), 2, 'and both answers are kept (R18)');
select is((select array_agg(answer order by id) from public.checkins), array['okay', 'off'], 'in order');
select is((select is_first from public.checkins where answer = 'off'), false, 'the change is not the first answer');
select is((select status_seen_before from public.checkins where answer = 'off'), true,
  'and it is known the status had been seen');
select lives_ok($$select public.submit_checkin(((now() at time zone 'utc') + interval '14 hours')::date, 'good', true)$$,
  'the date 14 hours ahead of UTC (the far side of the world) counts as today');
select is((select status_seen_before from public.checkins where answer = 'good'), true,
  'the app can say the status was showing');

select throws_ok($$select public.submit_checkin((now() at time zone 'utc')::date, 'great')$$, '22023', 'unknown answer',
  'an unknown answer is refused');
select throws_ok($$select public.submit_checkin((now() at time zone 'utc')::date - 3, 'good')$$, '22023',
  'a check-in is for today only', 'so is a check-in for another day');
select throws_ok($$insert into public.checkins (user_id, date, answer, status_seen_before, is_first)
  values ('31313131-3131-3131-3131-313131313131', '2026-10-05', 'good', false, true)$$, '42501', null,
  'check-ins cannot be written directly');

-- The usage log takes only its fixed shape, never health values.
select throws_ok($$select public.log_usage('chart_zoom')$$, '22023', 'unknown event', 'an unknown event is refused');
select lives_ok($$select public.log_usage('trends_open', '{"date": "2026-10-04"}')$$, 'a trend view open is logged');
select lives_ok($$select public.log_usage('digest_open', '{"date": "2026-10-04"}')$$, 'and a digest open');
select throws_ok($$select public.log_usage('card_view', '{"hrv": 38}')$$, '22023', 'unexpected details',
  'a reading cannot be logged');
select throws_ok($$select public.log_usage('card_view', '{"state": "ease_off"}')$$, '22023', 'unexpected details',
  'nor a status in place of the card''s kind');
select throws_ok($$select public.log_usage('card_view', '{"status_shown": "yes"}')$$, '22023', 'unexpected details',
  'details must have the right type');
select throws_ok($$delete from public.usage_events$$, '42501', null, 'the log cannot be changed directly');

-- Another tester sees none of it.
set local request.jwt.claims = '{"sub": "32323232-3232-3232-3232-323232323232", "role": "authenticated"}';
select is((select count(*)::int from public.checkins), 0, 'another tester sees none of the check-ins');
select is((select count(*)::int from public.usage_events), 0, 'or the usage log');

-- Zone numbers: the active version's, and the order of the readings, never
-- the weights.
select is((select array[ease_off_at, rest_at] from public.status_zones()), array[1.2, 2.4]::numeric[],
  'Ease off from 1.2 and Rest from 2.4 (version 2)');
select is((select array[window_nights, min_valid_nights] from public.status_zones()), array[42, 21],
  'normals from 42 nights, with 21 needed');
select is((select reading_order from public.status_zones(1)), array['hrv', 'sleeping_hr', 'sleep'],
  'readings in order of weight: HRV, sleeping heart rate, sleep');

reset role;
set local role anon;
select throws_ok($$select * from public.status_zones()$$, '42501', null, 'someone not signed in gets nothing');

reset role;
select * from finish();
rollback;
