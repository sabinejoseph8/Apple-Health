-- D87: a day whose only sleep last night is plain "asleep" (the Watch's
-- sleep without stages), at least 2 hours of it, has no status with the
-- reason no_sleep_stages, today and on past days. Once the Watch's stages
-- arrive the night is built as usual. Made-up readings only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- The local clock is 11am at a UTC-5 style offset chosen so the test means
-- the same whenever it runs.
create function pg_temp.off() returns integer language sql as $$
  select ((660 - (extract(hour from now() at time zone 'utc') * 60
                  + extract(minute from now() at time zone 'utc'))::integer + 2160) % 1440) - 720
$$;
create function pg_temp.today() returns date language sql as $$
  select ((now() at time zone 'utc') + make_interval(mins => pg_temp.off()))::date
$$;

insert into auth.users (id, email) values
  ('96969696-9696-9696-9696-969696969696', 'no-stages@example.test'),
  ('97979797-9797-9797-9797-979797979797', 'short-plain@example.test');
update public.profiles set latest_tz_offset_min = pg_temp.off()
 where user_id in ('96969696-9696-9696-9696-969696969696', '97979797-9797-9797-9797-979797979797');

-- Each reading belongs to an upload; an import post holds them, as an import
-- never counts as a morning sync.
create function pg_temp.sleep(p_user uuid, p_stage text, p_start timestamptz, p_end timestamptz) returns void language sql as $$
  with u as (
    insert into public.uploads (user_id, schema_version, kind, status, local_date, device_tz_offset_min, month_id)
    values (p_user, 1, 'backfill', 'accepted', pg_temp.today(), pg_temp.off(), to_char(pg_temp.today(), 'YYYY-MM')) returning id
  )
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, stage, sample_hash)
  select p_user, u.id, 'sleep_stage', p_start, p_end, pg_temp.off(), p_stage,
         sha256(convert_to(p_user::text || p_stage || p_start::text || p_end::text, 'UTF8'))
    from u
$$;
create function pg_temp.daily(p_user uuid, p_date date) returns void language sql as $$
  insert into public.uploads (user_id, schema_version, kind, status, local_date, device_tz_offset_min, run_trigger)
  values (p_user, 1, 'daily', 'accepted', p_date, pg_temp.off(), 'button')
$$;
create function pg_temp.reason(p_user uuid, p_date date) returns text language sql as $$
  select coalesce(no_status_reason, status) from public.daily_status where user_id = p_user and date = p_date
$$;

-- This morning: 2.5 hours of plain "asleep" and a sync.
select pg_temp.sleep('96969696-9696-9696-9696-969696969696', 'asleep', now() - interval '3 hours 30 minutes', now() - interval '1 hour');
select pg_temp.daily('96969696-9696-9696-9696-969696969696', pg_temp.today());
select public.recompute('96969696-9696-9696-9696-969696969696', pg_temp.today() - 2, pg_temp.today());
select is(pg_temp.reason('96969696-9696-9696-9696-969696969696', pg_temp.today()), 'no_sleep_stages',
  'a sync with only plain "asleep" sleep last night is labelled no_sleep_stages, not sleep in progress');
select is((select status from public.daily_status where user_id = '96969696-9696-9696-9696-969696969696' and date = pg_temp.today()),
  'none', 'and there is still no status');
select is((select count(*)::int from public.nights where user_id = '96969696-9696-9696-9696-969696969696'), 0,
  'and no night is built from it');

-- The same on a past day (yesterday's sync, yesterday's stage-less night).
select pg_temp.sleep('96969696-9696-9696-9696-969696969696', 'asleep', now() - interval '1 day 4 hours', now() - interval '1 day 1 hour');
select pg_temp.daily('96969696-9696-9696-9696-969696969696', pg_temp.today() - 1);
select public.recompute('96969696-9696-9696-9696-969696969696', pg_temp.today() - 2, pg_temp.today());
select is(pg_temp.reason('96969696-9696-9696-9696-969696969696', pg_temp.today() - 1), 'no_sleep_stages',
  'a past stage-less night is labelled the same way, not "not enough data"');

-- The Watch's stages arrive later this morning: the night is built as usual.
select pg_temp.sleep('96969696-9696-9696-9696-969696969696', 'core', now() - interval '6 hours', now() - interval '3 hours 30 minutes');
select public.recompute('96969696-9696-9696-9696-969696969696', pg_temp.today() - 2, pg_temp.today());
select is((select count(*)::int from public.nights
            where user_id = '96969696-9696-9696-9696-969696969696' and night_date = pg_temp.today()), 1,
  'once the stages arrive, the night is built');
select isnt(pg_temp.reason('96969696-9696-9696-9696-969696969696', pg_temp.today()), 'no_sleep_stages',
  'and the day is no longer labelled no_sleep_stages');

-- Under 2 hours of plain "asleep" is not a night either way: still in progress today.
select pg_temp.sleep('97979797-9797-9797-9797-979797979797', 'asleep', now() - interval '2 hours', now() - interval '1 hour');
select pg_temp.daily('97979797-9797-9797-9797-979797979797', pg_temp.today());
select public.recompute('97979797-9797-9797-9797-979797979797', pg_temp.today() - 2, pg_temp.today());
select is(pg_temp.reason('97979797-9797-9797-9797-979797979797', pg_temp.today()), 'night_unfinished',
  'under 2 hours of plain "asleep" keeps the usual sleep in progress');

-- The card can log that it showed this state, and nothing else new.
set local role authenticated;
set local request.jwt.claims = '{"sub": "96969696-9696-9696-9696-969696969696", "role": "authenticated"}';
select lives_ok($$select public.log_usage('card_view', '{"state": "no_sleep_stages", "status_shown": false}'::jsonb)$$,
  'the usage log accepts the no_sleep_stages card');
select throws_ok($$select public.log_usage('card_view', '{"state": "something_else"}'::jsonb)$$, '22023', null,
  'and still refuses an unknown card name');
reset role;

select * from finish();
rollback;
