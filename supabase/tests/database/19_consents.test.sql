-- Phase 6: consent (D79, D80). A person agrees to two statements before
-- anything is collected; uploads are refused without it; withdrawing
-- deletes everything and keeps the record. Made-up accounts only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('91919191-9191-9191-9191-919191919191', 'agrees@example.test'),
  ('92929292-9292-9292-9292-929292929292', 'not-yet@example.test');
select public.issue_upload_token('91919191-9191-9191-9191-919191919191', repeat('a', 64));
select public.issue_upload_token('92929292-9292-9292-9292-929292929292', repeat('b', 64));

select ok((select relrowsecurity from pg_class where oid = 'public.consents'::regclass), 'consents has row-level security');
select is(public.consent_version(), 2, 'the consent text is at version 2 (D85)');

-- Before agreeing, nothing is accepted.
select is(public.ingest_upload(repeat('b', 64), '{"schema_version": 1, "kind": "ping", "device_tz_offset_min": -300}'::jsonb) ->> 'error',
          'no_consent', 'an upload from someone who has not agreed is refused');
select is((select error from public.uploads where user_id = '92929292-9292-9292-9292-929292929292'), 'no_consent',
          'and logged as refused for that reason');

-- Agreeing, as the person.
set local role authenticated;
set local request.jwt.claims = '{"sub": "91919191-9191-9191-9191-919191919191", "role": "authenticated"}';
select throws_ok($$select public.give_consent(2, true, false)$$, '22023', 'both agreements are needed',
                 'agreeing needs both statements, the use and the US storage');
select throws_ok($$select public.give_consent(1, true, true)$$, '22023', 'that consent text is out of date',
                 'and the current text');
select isnt(public.give_consent(2, true, true), null, 'agreeing records the time');
create temp table first_time as select agreed_at from public.consents;
select is(public.give_consent(2, true, true), (select agreed_at from first_time), 'agreeing again changes nothing');
select is((select count(*)::int from public.consents), 1, 'one agreement in force');
select results_eq($$select version, agreed_use, agreed_us_storage, ended_at from public.consents$$,
                  $$values (2, true, true, null::timestamptz)$$, 'with its version and both statements');
select throws_ok($$insert into public.consents (user_id, version, agreed_use, agreed_us_storage)
                   values ('91919191-9191-9191-9191-919191919191', 2, true, true)$$, '42501', null,
                 'nobody writes the record directly');
select throws_ok($$update public.consents set agreed_at = now()$$, '42501', null, 'or changes it');
select throws_ok($$select public.withdraw_consent('91919191-9191-9191-9191-919191919191')$$, '42501', null,
                 'withdrawing goes through the password check, not straight to the database');

set local request.jwt.claims = '{"sub": "92929292-9292-9292-9292-929292929292", "role": "authenticated"}';
select is((select count(*)::int from public.consents), 0, 'nobody sees someone else''s agreement');
reset role;
set local role anon;
select throws_ok($$select public.give_consent(2, true, true)$$, '42501', null, 'someone signed out cannot agree');
reset role;

-- After agreeing, uploads are accepted.
select is(public.ingest_upload(repeat('a', 64), '{"schema_version": 1, "kind": "ping", "device_tz_offset_min": -300}'::jsonb) ->> 'error',
          null, 'an upload after agreeing is accepted');

-- Delete my data keeps the agreement.
select public.delete_my_data('91919191-9191-9191-9191-919191919191');
select is((select count(*)::int from public.consents where user_id = '91919191-9191-9191-9191-919191919191' and ended_at is null), 1,
          'Delete my data keeps the agreement');

-- Withdrawing deletes everything and keeps the record (D80).
select public.issue_upload_token('91919191-9191-9191-9191-919191919191', repeat('c', 64));
select public.ingest_upload(repeat('c', 64), '{"schema_version": 1, "kind": "ping", "device_tz_offset_min": -300}'::jsonb);
select public.withdraw_consent('91919191-9191-9191-9191-919191919191');
select is((select count(*)::int from public.uploads where user_id = '91919191-9191-9191-9191-919191919191'), 0,
          'withdrawing deletes the uploads');
select is((select count(*)::int from public.upload_tokens where user_id = '91919191-9191-9191-9191-919191919191'), 0,
          'and the upload token');
select results_eq($$select ended_why from public.consents where user_id = '91919191-9191-9191-9191-919191919191'$$,
                  $$values ('withdrawn'::text)$$, 'and keeps the agreement, marked withdrawn');
select is(public.has_consent('91919191-9191-9191-9191-919191919191'), false, 'so there is no consent any more');
select is((select count(*)::int from public.profiles where user_id = '91919191-9191-9191-9191-919191919191'), 1, 'the account stays');

-- A newer text replaces the agreement in force.
set local role authenticated;
set local request.jwt.claims = '{"sub": "92929292-9292-9292-9292-929292929292", "role": "authenticated"}';
select public.give_consent(2, true, true);
select public.give_consent(3, true, true);
select results_eq($$select version, ended_why from public.consents order by id$$,
                  $$values (2, 'new_version'::text), (3, null)$$, 'agreeing to a newer text replaces the older agreement');
reset role;
set local role anon;
select throws_ok($$select count(*) from public.consents$$, '42501', null, 'and someone signed out cannot read any agreement');
reset role;

select * from finish();
rollback;
