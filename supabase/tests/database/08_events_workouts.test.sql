-- Phase 2c: events and workouts for the Signal check (D54, D55). Only the
-- owner can load them, each load replaces the last, and everyone reads only
-- their own rows. Made-up events only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_app_meta_data) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'owner-m@example.test', '{"is_owner": true}'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'tester-n@example.test', '{}');

set local role authenticated;
set local request.jwt.claims = '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd", "role": "authenticated"}';

select is(public.replace_my_events('[
  {"date": "2026-02-03", "type": "illness", "note": "cold"},
  {"date": "2026-02-04", "type": "illness", "note": "cold"},
  {"date": "2026-07-30", "type": "travel", "note": "trip out"}]'::jsonb), 3, 'the owner loads her events');
select is(public.replace_my_events('[
  {"date": "2026-02-03", "type": "illness", "note": "cold"},
  {"date": "2026-03-14", "type": "major_event", "note": "late night"}]'::jsonb), 2, 'loading again replaces them');
select is((select count(*)::int from public.events), 2, 'so only the new list is kept');

select is(public.replace_my_workouts('[
  {"activity": "running", "start_at": "2026-02-01 07:00-05", "end_at": "2026-02-01 07:45-05", "tz_offset_min": -300,
   "duration_min": 45, "avg_hr": 150, "source_name": "Apple Watch"},
  {"activity": "running", "start_at": "2026-02-05 07:00-05", "end_at": "2026-02-05 07:15-05", "tz_offset_min": -300,
   "duration_min": 15, "avg_hr": 128, "source_name": "Apple Watch"}]'::jsonb), 2, 'the owner loads her workouts');
select throws_ok($$select public.replace_my_events('{"date": "2026-02-03"}'::jsonb)$$, 'P0001', 'events must be a list',
  'a malformed load is refused');
select throws_ok($$select public.replace_my_events('[{"date": "2026-02-03", "type": "flu"}]'::jsonb)$$, '23514', null,
  'an unknown event type is refused');
select throws_ok($$insert into public.events (user_id, date, type) values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '2026-01-01', 'illness')$$,
  '42501', null, 'events cannot be written directly');

-- A tester can't load either, and sees none of the owner's rows.
set local request.jwt.claims = '{"sub": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", "role": "authenticated"}';
select throws_ok($$select public.replace_my_events('[]'::jsonb)$$, '42501', 'only the owner can load events',
  'a tester cannot load events');
select throws_ok($$select public.replace_my_workouts('[]'::jsonb)$$, '42501', 'only the owner can load workouts',
  'or workouts');
select is((select count(*)::int from public.events), 0, 'a tester sees none of the owner''s events');
select is((select count(*)::int from public.workouts), 0, 'or workouts');

reset role;
select * from finish();
rollback;
