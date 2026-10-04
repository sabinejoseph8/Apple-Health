-- Phase 4: the analysis queue queues the morning notification after a
-- morning sync's work, and never after an import's (R12, R48). Thirty
-- made-up nights from a made-up watch build the normals; the person's time
-- zone is set so it is 7am for them now, so the morning rules apply.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('43434343-4343-4343-4343-434343434343', 'tester-t@example.test');

-- The offset that makes it 7:00am for the person now (within -12h to +14h).
create temp table setting as
select o.offset_min,
       ((now() at time zone 'utc') + o.offset_min * interval '1 minute')::date as today
  from (select case when m > 840 then m - 1440 when m < -720 then m + 1440 else m end as offset_min
          from (select (7 * 60 - (extract(hour from now() at time zone 'utc') * 60
                                  + extract(minute from now() at time zone 'utc')))::integer as m) x) o;

update public.profiles set latest_tz_offset_min = (select offset_min from setting)
 where user_id = '43434343-4343-4343-4343-434343434343';

insert into public.uploads (id, user_id, received_at, schema_version, kind, device_tz_offset_min, local_date, night_complete, status)
select '00000000-0000-4000-8000-000000000043', '43434343-4343-4343-4343-434343434343', now() - interval '5 minutes', 1, 'daily',
       offset_min, today, true, 'accepted'
  from setting;

-- Nights from 10:30pm to 6:30am local, for the last 30 nights and last night.
create temp table made_nights as
select n, ((s.today - n) + time '06:30' - s.offset_min * interval '1 minute') at time zone 'utc' as sleep_end, s.offset_min
  from setting s, generate_series(0, 30) as n;

insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, stage, sample_hash)
select '43434343-4343-4343-4343-434343434343', '00000000-0000-4000-8000-000000000043', 'sleep_stage',
       sleep_end - interval '8 hours', sleep_end, offset_min, 'core', sha256(convert_to('sleep|' || n, 'UTF8'))
  from made_nights;

insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, unit, source_name, sample_hash)
select '43434343-4343-4343-4343-434343434343', '00000000-0000-4000-8000-000000000043', 'heart_rate', t, t, offset_min,
       50 + (n % 3), 'count/min', 'Made-up Watch', sha256(convert_to('hr|' || t, 'UTF8'))
  from made_nights, generate_series(sleep_end - interval '7 hours 50 minutes', sleep_end, interval '10 minutes') as t;

insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, unit, source_name, sample_hash)
select '43434343-4343-4343-4343-434343434343', '00000000-0000-4000-8000-000000000043', 'hrv_sdnn', t, t, offset_min,
       50 + (n % 5), 'ms', 'Made-up Watch', sha256(convert_to('hrv|' || t, 'UTF8'))
  from made_nights, unnest(array[sleep_end - interval '6 hours', sleep_end - interval '4 hours', sleep_end - interval '2 hours']) as t;

-- An import's work first: it never notifies.
insert into public.analysis_queue (user_id, from_date, to_date, reason, send_push, queued_at)
select '43434343-4343-4343-4343-434343434343', today - 35, today, 'backfill', false, now() - interval '5 minutes' from setting;
select is(public.run_analysis_queue(), 1, 'the import''s work is done');
select is((select count(*)::int from public.notifications), 0, 'and queues no notification (R12)');

-- Then a morning sync's work: the status is worked out and the morning
-- notification queued (R48).
insert into public.analysis_queue (user_id, from_date, to_date, reason, send_push)
select '43434343-4343-4343-4343-434343434343', today - 1, today, 'daily', true from setting;
select public.run_analysis_queue();
select isnt((select status from public.daily_status d, setting s
              where d.user_id = '43434343-4343-4343-4343-434343434343' and d.date = s.today), 'none',
  'the made-up morning has a status');
select is((select kind || ' ' || date from public.notifications), (select 'morning ' || today from setting),
  'and the morning notification is queued for it');

select * from finish();
rollback;
