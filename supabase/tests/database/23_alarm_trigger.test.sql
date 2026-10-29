-- D94: a sync started by the alarm automation is logged as "alarm".
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (id, email) values ('94949494-9494-9494-9494-949494949494', 'alarm@example.test');
insert into public.consents (user_id, version, agreed_use, agreed_us_storage)
values ('94949494-9494-9494-9494-949494949494', 2, true, true);
select public.issue_upload_token('94949494-9494-9494-9494-949494949494', repeat('e', 64));

select is(public.ingest_upload(repeat('e', 64), '{"schema_version": 1, "kind": "ping", "device_tz_offset_min": -300, "trigger": "alarm"}'::jsonb) ->> 'error',
          null, 'a sync from the alarm automation is accepted');
select is((select run_trigger from public.uploads where user_id = '94949494-9494-9494-9494-949494949494'), 'alarm',
          'and logged as started by the alarm');

select * from finish();
rollback;
