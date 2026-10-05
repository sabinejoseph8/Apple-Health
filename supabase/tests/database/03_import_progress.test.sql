-- Import progress (R12): a backfill reply says how many months of the import
-- window (this month and the 11 before it) have arrived in full (their last
-- part, marked month_complete). Other replies don't.
-- Import posts and pings each have their own rate limit of 200 an hour per
-- token, counted apart from the 60 an hour for everything else.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'user-c@example.test');
-- Phase 6: uploads need consent (D79), so these made-up people have agreed.
insert into public.consents (user_id, version, agreed_use, agreed_us_storage) values
  ('33333333-3333-3333-3333-333333333333', 1, true, true);
select public.issue_upload_token('33333333-3333-3333-3333-333333333333', repeat('f', 64));

-- The phone is on UTC here, so its local month is the UTC month.
create function pg_temp.month(p_back integer) returns text language sql as $$
  select to_char((now() at time zone 'utc') - make_interval(months => p_back), 'YYYY-MM')
$$;

-- A month's last part, marked month_complete as the Shortcut does.
create function pg_temp.backfill(p_back integer) returns jsonb language sql as $$
  select public.ingest_upload(repeat('f', 64), jsonb_build_object(
    'schema_version', 1, 'kind', 'backfill', 'month_id', pg_temp.month(p_back), 'device_tz_offset_min', 0,
    'month_complete', true, 'samples', '[]'::jsonb))
$$;

-- An earlier part of a month (not its last).
create function pg_temp.part(p_back integer) returns jsonb language sql as $$
  select public.ingest_upload(repeat('f', 64), jsonb_build_object(
    'schema_version', 1, 'kind', 'backfill', 'month_id', pg_temp.month(p_back), 'device_tz_offset_min', 0,
    'samples', '[]'::jsonb))
$$;

select is((pg_temp.part(11) ->> 'months_imported')::int, 0, 'a month does not count until its last part arrives');

select is((pg_temp.backfill(11) ->> 'months_imported')::int, 1, 'the oldest month of the window counts as 1 of 12');
select is((pg_temp.backfill(10) ->> 'months_imported')::int, 2, 'a second month counts as 2');
select is((pg_temp.backfill(10) ->> 'months_imported')::int, 2, 'sending a month again does not count it twice');
select is((pg_temp.backfill(12) ->> 'months_imported')::int, 2, 'a month before the window is not counted');
select is((pg_temp.backfill(0) ->> 'months_imported')::int, 3, 'this month counts too');

select is(public.ingest_upload(repeat('f', 64), jsonb_build_object(
    'schema_version', 1, 'kind', 'daily', 'device_tz_offset_min', 0, 'samples', '[]'::jsonb)) ? 'months_imported', false,
  'a daily reply carries no month count');

select is(public.ingest_upload(repeat('f', 64), null, 'bad body') ->> 'months_imported', null,
  'a rejected post carries no month count');

-- 60 other posts this hour: daily posts are refused, import posts aren't.
insert into public.uploads (user_id, token_id, status, error)
select '33333333-3333-3333-3333-333333333333', id, 'rejected', 'test'
  from public.upload_tokens, generate_series(1, 60)
 where token_hash = repeat('f', 64);
select is(public.ingest_upload(repeat('f', 64), jsonb_build_object(
    'schema_version', 1, 'kind', 'daily', 'device_tz_offset_min', 0, 'samples', '[]'::jsonb)) ->> 'error', 'rate_limited',
  'a 61st daily post in an hour is refused');
select is(pg_temp.backfill(1) ->> 'error', null, 'an import post still goes through after 60 other posts');

-- Pings have their own allowance: 60 daily posts' worth of pings don't block
-- a daily post, and more than 200 pings an hour are refused.
create function pg_temp.ping() returns jsonb language sql as $$
  select public.ingest_upload(repeat('f', 64), jsonb_build_object(
    'schema_version', 1, 'kind', 'ping', 'device_tz_offset_min', 0, 'samples', '[]'::jsonb))
$$;
select is(pg_temp.ping() ->> 'error', null, 'a ping still goes through after 60 other posts');
insert into public.uploads (user_id, token_id, schema_version, kind, device_tz_offset_min, local_date, status)
select '33333333-3333-3333-3333-333333333333', id, 1, 'ping', 0, current_date, 'accepted'
  from public.upload_tokens, generate_series(1, 199)
 where token_hash = repeat('f', 64);
select is(pg_temp.ping() ->> 'error', 'rate_limited', 'more than 200 pings an hour are refused');

-- 200 import posts this hour: the next import post is refused.
insert into public.uploads (user_id, token_id, schema_version, kind, month_id, device_tz_offset_min, local_date, status)
select '33333333-3333-3333-3333-333333333333', id, 1, 'backfill', pg_temp.month(2), 0, current_date, 'accepted'
  from public.upload_tokens, generate_series(1, 200)
 where token_hash = repeat('f', 64);
select is(pg_temp.backfill(3) ->> 'error', 'rate_limited', 'more than 200 import posts an hour are refused');

select * from finish();
rollback;
