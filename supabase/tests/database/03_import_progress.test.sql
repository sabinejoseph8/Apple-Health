-- Import progress (R12): a backfill reply says how many months of the import
-- window (this month and the 11 before it) have arrived. Other replies don't.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'user-c@example.test');
select public.issue_upload_token('33333333-3333-3333-3333-333333333333', repeat('f', 64));

-- The phone is on UTC here, so its local month is the UTC month.
create function pg_temp.month(p_back integer) returns text language sql as $$
  select to_char((now() at time zone 'utc') - make_interval(months => p_back), 'YYYY-MM')
$$;

create function pg_temp.backfill(p_back integer) returns jsonb language sql as $$
  select public.ingest_upload(repeat('f', 64), jsonb_build_object(
    'schema_version', 1, 'kind', 'backfill', 'month_id', pg_temp.month(p_back), 'device_tz_offset_min', 0,
    'samples', '[]'::jsonb))
$$;

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

select * from finish();
rollback;
