-- Phase 5: sign out everywhere stops notifications to all of that person's
-- devices, and only theirs (R7). Made-up accounts only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('81818181-8181-8181-8181-818181818181', 'tester-aa@example.test'),
  ('82828282-8282-8282-8282-828282828282', 'tester-bb@example.test');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('81818181-8181-8181-8181-818181818181', 'https://push.example/phone', 'k', 'a'),
  ('81818181-8181-8181-8181-818181818181', 'https://push.example/laptop', 'k', 'a'),
  ('82828282-8282-8282-8282-828282828282', 'https://push.example/other', 'k', 'a');

set local role authenticated;
set local request.jwt.claims = '{"sub": "81818181-8181-8181-8181-818181818181", "role": "authenticated"}';
select is(public.forget_all_devices(), 2, 'both of tester AA''s devices stop getting notifications');
select is((select count(*)::int from public.push_subscriptions where revoked_at is null), 0, 'none of theirs is left');
select is(public.forget_all_devices(), 0, 'running it again changes nothing');
select lives_ok($$select public.register_push('https://push.example/phone', 'k2', 'a2')$$, 'signing in again on a phone registers it afresh');
select is((select count(*)::int from public.push_subscriptions where revoked_at is null), 1, 'only that phone');
reset role;
select is((select count(*)::int from public.push_subscriptions where user_id = '82828282-8282-8282-8282-828282828282' and revoked_at is null), 1,
  'another person''s device is untouched');

select * from finish();
rollback;
