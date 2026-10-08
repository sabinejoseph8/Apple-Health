-- D86: only the Watch's own sleep stages (core, deep, REM) complete last
-- night, the same rule the night builder uses (D10, D49). A plain "asleep"
-- record, or "in bed", never does, so it can't stop the day's syncs before
-- the Watch's record arrives. Made-up readings only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('94949494-9494-9494-9494-949494949494', 'stages@example.test');
insert into public.consents (user_id, version, agreed_use, agreed_us_storage)
values ('94949494-9494-9494-9494-949494949494', 2, true, true);
select public.issue_upload_token('94949494-9494-9494-9494-949494949494', repeat('e', 64));

-- A time zone offset that makes the phone's local time 11am right now, so
-- "last night" is the same whenever the test runs.
create function pg_temp.off() returns integer language sql as $$
  select ((660 - (extract(hour from now() at time zone 'utc') * 60
                  + extract(minute from now() at time zone 'utc'))::integer + 2160) % 1440) - 720
$$;

create function pg_temp.post(p_kind text, p_samples jsonb) returns jsonb language sql as $$
  select public.ingest_upload(repeat('e', 64), jsonb_build_object('schema_version', 1, 'kind', p_kind,
    'device_tz_offset_min', pg_temp.off(), 'trigger', 'button', 'samples', p_samples))
$$;

create function pg_temp.sleep(p_stage text, p_start timestamptz, p_end timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('type', 'sleep_stage', 'start_at', p_start, 'end_at', p_end,
                            'tz_offset_min', pg_temp.off(), 'stage', p_stage, 'source_name', 'Test Watch')
$$;

-- A stage-less night, as on 8 October 2026: plain "asleep" and "awake" only.
select is((pg_temp.post('daily', jsonb_build_array(
  pg_temp.sleep('in_bed', now() - interval '4 hours', now() - interval '1 hour'),
  pg_temp.sleep('asleep', now() - interval '3 hours 30 minutes', now() - interval '2 hours'),
  pg_temp.sleep('awake', now() - interval '2 hours', now() - interval '1 hour 55 minutes'),
  pg_temp.sleep('asleep', now() - interval '1 hour 55 minutes', now() - interval '1 hour')
)) ->> 'night_complete')::boolean, false, 'plain "asleep" records do not complete the night');
select is((pg_temp.post('ping', '[]'::jsonb) ->> 'already_complete_today')::boolean, false,
  'so the next ping is told today is not done yet');
select is((select count(*)::int from public.uploads
            where user_id = '94949494-9494-9494-9494-949494949494' and night_complete), 0,
  'and no upload is logged as completing the night');

-- The Watch's stages arrive later that morning.
select is((pg_temp.post('daily', jsonb_build_array(
  pg_temp.sleep('core', now() - interval '6 hours', now() - interval '3 hours'),
  pg_temp.sleep('rem', now() - interval '3 hours', now() - interval '1 hour')
)) ->> 'night_complete')::boolean, true, 'the Watch''s stages complete the night');
select is((pg_temp.post('ping', '[]'::jsonb) ->> 'already_complete_today')::boolean, true,
  'and from then on today is done');

-- Each stage on its own is enough; an unfinished one is not.
select is((select bool_and(x) from (
  select (pg_temp.post('daily', jsonb_build_array(pg_temp.sleep(s, now() - interval '5 hours', now() - interval '30 minutes')))
          ->> 'night_complete')::boolean as x
    from unnest(array['core', 'deep', 'rem']) as s) t), true,
  'core, deep and REM each count');

-- A different person whose only stage ended under 10 minutes ago.
insert into auth.users (id, email) values ('95959595-9595-9595-9595-959595959595', 'still-asleep@example.test');
insert into public.consents (user_id, version, agreed_use, agreed_us_storage)
values ('95959595-9595-9595-9595-959595959595', 2, true, true);
select public.issue_upload_token('95959595-9595-9595-9595-959595959595', repeat('f', 64));
select is((public.ingest_upload(repeat('f', 64), jsonb_build_object('schema_version', 1, 'kind', 'daily',
  'device_tz_offset_min', pg_temp.off(), 'trigger', 'charger', 'samples', jsonb_build_array(
    pg_temp.sleep('core', now() - interval '5 hours', now() - interval '5 minutes')))) ->> 'night_complete')::boolean,
  false, 'a stage that ended under 10 minutes ago is not complete yet');

select * from finish();
rollback;
