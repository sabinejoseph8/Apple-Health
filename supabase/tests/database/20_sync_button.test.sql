-- D84: a sync started by the card's Sync now button is logged as "button".
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (id, email) values ('93939393-9393-9393-9393-939393939393', 'button@example.test');
insert into public.consents (user_id, version, agreed_use, agreed_us_storage)
values ('93939393-9393-9393-9393-939393939393', 1, true, true);
select public.issue_upload_token('93939393-9393-9393-9393-939393939393', repeat('d', 64));

select is(public.ingest_upload(repeat('d', 64), '{"schema_version": 1, "kind": "ping", "device_tz_offset_min": -300, "trigger": "button"}'::jsonb) ->> 'error',
          null, 'a sync from the Sync now button is accepted');
select is((select run_trigger from public.uploads where user_id = '93939393-9393-9393-9393-939393939393'), 'button',
          'and logged as started by the button');

select * from finish();
rollback;
