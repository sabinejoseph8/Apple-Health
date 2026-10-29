-- 7b-7 code review: a job stuck running is given up on, a failing queue never
-- blocks a status, and a text for a deleted job is dropped. Made-up values only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'ai-fix-a@example.test'),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'ai-fix-b@example.test');
insert into public.consents (user_id, version, agreed_use, agreed_us_storage, agreed_ai) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 3, true, true, true),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 3, true, true, true);

-- 1: stuck jobs
insert into public.ai_jobs (user_id, kind, for_date, status, attempts, started_at) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'morning', current_date, 'running', 3, now() - interval '5 minutes'),
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'morning', current_date - 1, 'running', 2, now() - interval '5 minutes');
select is((select count(*)::int from public.ai_claim_jobs(5)), 1,
  'a job stuck through its third try is not claimed again; one stuck on its second still is');
select is((select status || '/' || last_error from public.ai_jobs
            where user_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and for_date = current_date), 'failed/timeout',
  'the exhausted one is given up on, with the reason');
select is((select status || '/' || attempts from public.ai_jobs
            where user_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and for_date = current_date - 1), 'running/3',
  'and the other is on its third and last try');
select is((select count(*)::int from public.ai_claim_jobs(5)), 0, 'nothing is claimed again until that try has timed out');

-- 3: a text only while its job exists
select public.ai_save('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'morning', current_date - 5,
                      '{"explanation": "A made-up explanation."}'::jsonb, 'claude-opus-5-5', 'v3', 'h', 'ready', 'train_as_planned', 1, 1, 1, 1);
select is((select count(*)::int from public.ai_texts where user_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'), 0,
  'a text for a job that no longer exists is dropped');
select public.ai_save('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'morning', current_date - 1,
                      '{"explanation": "A made-up explanation."}'::jsonb, 'claude-opus-5-5', 'v3', 'h', 'ready', 'train_as_planned', 1, 1, 1, 1);
select is((select count(*)::int from public.ai_texts where user_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'), 1,
  'and one for a job that is there is kept');

-- 2: a queue that fails never blocks a status
alter table public.ai_jobs add constraint ai_jobs_test_block check (false) not valid;
select lives_ok($$insert into public.daily_status (user_id, date, status, no_status_reason, readings_used, points, total, nudge, settings_version)
                  values ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', current_date, 'ready', null, 3, '{}', 0.2, 'train_as_planned', 3)$$,
  'a status saves even when its job cannot be queued');
select is((select count(*)::int from public.daily_status where user_id = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2'), 1,
  'and the status is there');

-- 2 again: a failed start still leaves the job queued
drop trigger ai_on_digest on public.digests;
alter table public.ai_jobs drop constraint ai_jobs_test_block;
create or replace function public.ai_start() returns bigint language plpgsql as $$ begin raise exception 'the writer cannot start'; end; $$;
create trigger ai_on_digest after insert on public.digests for each row execute function public.ai_on_digest();
select lives_ok($$insert into public.digests (user_id, week_start, facts) values ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', date '2026-10-26', '{}')$$,
  'a digest saves even when the writer cannot be started');
select is((select status from public.ai_jobs where user_id = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2' and kind = 'digest'), 'pending',
  'and its job is still queued for the every-minute job');

-- 4: the "Getting ready" card view is counted
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1", "role": "authenticated"}', true);
select lives_ok($$select public.log_usage('card_view', jsonb_build_object('date', (now() at time zone 'utc')::date::text, 'status_shown', false, 'state', 'writing'))$$,
  'a card view while the card is getting ready is logged');
reset role;

select * from finish();
rollback;
