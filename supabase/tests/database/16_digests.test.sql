-- Phase 5: the weekly digest for a fixed made-up week matches its expected
-- facts (R57, R58, D71), and is built from 5am on Monday local time.
-- Week of Monday 21 September 2026; tester W in UTC-5.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('61616161-6161-6161-6161-616161616161', 'tester-w@example.test'),
  ('62626262-6262-6262-6262-626262626262', 'tester-x@example.test');
update public.profiles set latest_tz_offset_min = -300 where user_id = '61616161-6161-6161-6161-616161616161';
insert into public.uploads (user_id, received_at, schema_version, kind, device_tz_offset_min, local_date, status)
values ('61616161-6161-6161-6161-616161616161', '2026-09-24 07:00-05', 1, 'daily', -300, '2026-09-24', 'accepted');

-- Nights on six of the seven days (not Sunday 27).
insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                           sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count, coverage, confidence)
select '61616161-6161-6161-6161-616161616161', d, -300, d - interval '7 hours', d + interval '6 hours', 430, true,
       50, 60, 52, 3, 15, 30, 1, 'high'
  from generate_series(date '2026-09-21', date '2026-09-26', interval '1 day') as d;

-- Each day's status. HRV: 52, 38 (below), 50, 30 (below), 54 against 52;
-- sleeping heart rate 58 (above) on Thursday; sleep normal throughout.
create function pg_temp.day(p_date date, p_status text, p_nudge text, p_hrv numeric, p_shr numeric, p_fired boolean)
returns void language sql as $$
  insert into public.daily_status (user_id, date, status, no_status_reason, readings_used, points, total, nudge,
                                   composite_fired, settings_version)
  values ('61616161-6161-6161-6161-616161616161', p_date, p_status,
          case when p_status = 'none' then 'not_enough_data' end, 3,
          case when p_status = 'none' then '{}'::jsonb else jsonb_build_object(
            'hrv', jsonb_build_object('value', p_hrv, 'normal', 52, 'verdict', case when p_hrv < 40 then 'below' else 'in_range' end),
            'sleep', jsonb_build_object('value', 430, 'normal', 430, 'verdict', 'in_range'),
            'sleeping_hr', jsonb_build_object('value', p_shr, 'normal', 50, 'verdict', case when p_shr > 55 then 'above' else 'in_range' end))
          end, null, p_nudge, p_fired, 2)
$$;
select pg_temp.day('2026-09-21', 'ready', 'train_as_planned', 52, 50, false);
select pg_temp.day('2026-09-22', 'ease_off', 'train_easy', 38, 50, false);
-- Shown as Ease off that morning, recalculated to Ready later (D71).
select pg_temp.day('2026-09-23', 'ready', 'train_as_planned', 50, 50, false);
select pg_temp.day('2026-09-24', 'rest', 'rest', 30, 58, true);
select pg_temp.day('2026-09-25', 'ready', 'train_as_planned', 54, 50, false);
select pg_temp.day('2026-09-26', 'none', null, null, null, null);

insert into public.shown_status (user_id, date, via, status, nudge, readings_used, settings_version, shown_at) values
  ('61616161-6161-6161-6161-616161616161', '2026-09-22', 'card', 'ease_off', 'train_easy', 3, 2, '2026-09-22 07:00-05'),
  ('61616161-6161-6161-6161-616161616161', '2026-09-23', 'card', 'ease_off', 'train_easy', 3, 2, '2026-09-23 07:00-05'),
  ('61616161-6161-6161-6161-616161616161', '2026-09-24', 'notification', 'rest', 'rest', 3, 2, '2026-09-24 07:01-05');
insert into public.followthrough (user_id, date, answer, channel, answered_at) values
  ('61616161-6161-6161-6161-616161616161', '2026-09-22', 'yes', 'card', '2026-09-22 20:10-05'),
  ('61616161-6161-6161-6161-616161616161', '2026-09-22', 'no', 'card', '2026-09-22 20:12-05'),
  ('61616161-6161-6161-6161-616161616161', '2026-09-23', 'yes', 'push', '2026-09-23 20:05-05');

-- Built from 5am on Monday local time, once.
select is(public.build_due_digests('2026-09-28 04:59-05'), 0, 'not before 5am on Monday');
select is(public.build_due_digests('2026-09-27 12:00-05'), 0, 'nor on Sunday');
select is(public.build_due_digests('2026-09-28 05:00-05'), 1, 'from 5am on Monday, last week''s digest is built');
select is(public.build_due_digests('2026-09-28 06:00-05'), 0, 'once');

create temp table f as
select facts from public.digests where user_id = '61616161-6161-6161-6161-616161616161' and week_start = '2026-09-21';

select is((select facts ->> 'week_end' from f), '2026-09-27', 'it covers Monday to Sunday');
select is((select (facts ->> 'days_with_data')::int from f), 6, 'six days had data (R58)');
select is((select facts -> 'statuses' from f), '{"ready": 2, "ease_off": 2, "rest": 1, "none": 2}'::jsonb,
  'statuses as shown: Tuesday and the recalculated Wednesday count as Ease off (D71)');
select is((select jsonb_path_query_array(facts, '$.flagged[*].date') from f), '["2026-09-22", "2026-09-23", "2026-09-24"]'::jsonb,
  'the flagged days');
select is((select facts -> 'readings' -> 'hrv' from f), '{"nights": 5, "below": 2, "above": 0, "average": 44.8, "normal": 52.0}'::jsonb,
  'HRV: below the range on 2 of 5 nights, averaging 44.8 against 52');
select is((select facts -> 'readings' -> 'sleeping_hr' from f), '{"nights": 5, "below": 0, "above": 1, "average": 51.6, "normal": 50.0}'::jsonb,
  'sleeping heart rate: above the range on 1 night');
select is((select (facts ->> 'pattern_nights')::int from f), 1, 'the pattern showed on one night');
select is((select facts -> 'nudges' from f), '{"change_days": 3, "followed": 1, "not_followed": 1, "unanswered": 1}'::jsonb,
  'nudges: 3 change days, followed once (latest answers), not once, unanswered once');

set local role authenticated;
set local request.jwt.claims = '{"sub": "62626262-6262-6262-6262-626262626262", "role": "authenticated"}';
select is((select count(*)::int from public.digests), 0, 'another tester sees none of it');
select throws_ok($$select public.build_digest('62626262-6262-6262-6262-626262626262', '2026-09-21')$$, '42501', null,
  'and nobody signed in can build one');
reset role;

select * from finish();
rollback;
