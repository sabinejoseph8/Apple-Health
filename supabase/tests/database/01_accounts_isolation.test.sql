-- Cross-user tests for profiles and push_subscriptions: each user can read
-- only their own rows, and nobody can write to the tables directly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Two made-up accounts, created as the owner would in the dashboard.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.test');

select is((select count(*)::int from public.profiles where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2,
  'a profile is created for each new account');
select is((select bool_or(is_owner) from public.profiles where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), false,
  'new accounts are not the owner');

-- The owner flag comes only from admin-only account metadata.
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || '{"is_owner": true}'
 where id = '11111111-1111-1111-1111-111111111111';
select is((select is_owner from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  true, 'setting the owner flag in account metadata marks the profile as owner');

-- Act as user A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq('select user_id from public.profiles',
  $$values ('11111111-1111-1111-1111-111111111111'::uuid)$$,
  'user A sees only their own profile');
select is_empty($$select 1 from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A cannot read user B''s profile');
select throws_ok($$update public.profiles set is_owner = true$$, '42501', null,
  'user A cannot change profiles directly');
select throws_ok($$insert into public.profiles (user_id) values ('33333333-3333-3333-3333-333333333333')$$, '42501', null,
  'user A cannot add profiles');
select throws_ok($$delete from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'$$, '42501', null,
  'user A cannot delete profiles');

select isnt(public.register_push('https://push.example.test/device-a', 'key-a', 'auth-a'), null,
  'user A can register their device for notifications');
select throws_ok($$select public.register_push('http://push.example.test/insecure', 'k', 'a')$$, '22023', null,
  'a non-https push address is refused');
select throws_ok($$select public.register_push('https://push.example.test/x', '', 'a')$$, '22023', null,
  'empty push keys are refused');

-- Act as user B.
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

select isnt(public.register_push('https://push.example.test/device-b', 'key-b', 'auth-b'), null,
  'user B can register their device for notifications');
select results_eq('select endpoint from public.push_subscriptions',
  $$values ('https://push.example.test/device-b'::text)$$,
  'user B sees only their own device');
select results_eq('select user_id from public.profiles',
  $$values ('22222222-2222-2222-2222-222222222222'::uuid)$$,
  'user B sees only their own profile');

-- Back to user A.
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq('select endpoint from public.push_subscriptions',
  $$values ('https://push.example.test/device-a'::text)$$,
  'user A sees only their own device');
select throws_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                   values ('22222222-2222-2222-2222-222222222222', 'https://push.example.test/fake', 'k', 'a')$$,
  '42501', null, 'user A cannot add a device for user B');
select throws_ok($$update public.push_subscriptions set user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'user A cannot change device rows directly');
select throws_ok($$delete from public.push_subscriptions$$, '42501', null,
  'user A cannot delete device rows directly');
select throws_ok($$truncate public.profiles$$, '42501', null,
  'user A cannot empty the profiles table (TRUNCATE ignores row-level security)');
select throws_ok($$truncate public.push_subscriptions$$, '42501', null,
  'user A cannot empty the devices table');

-- Signing in as another account on the same phone moves the device.
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select lives_ok($$select public.register_push('https://push.example.test/device-a', 'key-a2', 'auth-a2')$$,
  'user B can sign in on user A''s phone and register it');
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select is_empty('select 1 from public.push_subscriptions',
  'user A no longer gets notifications on a phone now signed in as user B');

-- Not signed in.
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok('select 1 from public.profiles', '42501', null,
  'someone not signed in cannot read profiles');
select throws_ok('select 1 from public.push_subscriptions', '42501', null,
  'someone not signed in cannot read devices');
select throws_ok($$select public.register_push('https://push.example.test/anon', 'k', 'a')$$, '42501', null,
  'someone not signed in cannot register a device');

reset role;
select is((select count(*)::int from public.push_subscriptions where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2,
  'two devices are stored in total');

select * from finish();
rollback;
