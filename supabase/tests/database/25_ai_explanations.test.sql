-- D94, D95: consent version 3 (the AI agreement is required), the AI's job
-- queue and its saved texts, and the digest input. Made-up values only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- ---------------------------------------------------------------- consent v3
select is(public.consent_version(), 4, 'the consent text is version 4');
select is((select provolatile::text from pg_proc where oid = 'public.consent_version()'::regprocedure), 's',
  'and the version function is marked stable, not immutable');
select is((select count(*)::int from pg_proc where proname = 'give_consent' and pronargs = 3), 0,
  'the three-statement give_consent is gone');

insert into auth.users (id, email) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'ai-a@example.test'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'ai-b@example.test'),
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 'ai-old@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1", "role": "authenticated"}', true);
select throws_ok($$select public.give_consent(4, true, true, false)$$, '22023', 'all three agreements are needed',
  'agreeing without the AI box is refused');
select throws_ok($$select public.give_consent(2, true, true, true)$$, '22023', 'that consent text is out of date',
  'an out-of-date text is refused');
select lives_ok($$select public.give_consent(4, true, true, true)$$, 'agreeing to all three works');
select set_config('request.jwt.claims', '{"sub": "c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2", "role": "authenticated"}', true);
select lives_ok($$select public.give_consent(4, true, true, true)$$, 'a second person agrees too');
reset role;

select is((select agreed_ai from public.consents where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' and ended_at is null),
  true, 'the agreement records the AI box');
-- A person who only agreed to version 2 has not agreed to the AI.
insert into public.consents (user_id, version, agreed_use, agreed_us_storage)
values ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', 2, true, true);
select is((select agreed_ai from public.consents where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'), false,
  'an older agreement has no AI consent');
select is(public.has_consent('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'), false, 'and no longer counts as consent');

-- ------------------------------------------------------------------- the queue
-- A status built today for a person who agreed gets a job; an old day, a day
-- without a status, or a person who has not agreed does not.
insert into public.daily_status (user_id, date, status, no_status_reason, readings_used, points, total, nudge, settings_version)
values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', current_date, 'ease_off', null, 3, '{}', 1.4, 'train_easy', 3),
       ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', date '2026-01-05', 'ready', null, 3, '{}', 0.2, 'train_as_planned', 3),
       ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', current_date, 'none', 'not_enough_data', 0, '{}', null, null, 3),
       ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', current_date, 'ready', null, 3, '{}', 0.2, 'train_as_planned', 3);
select is((select count(*)::int from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' and kind = 'morning'
              and for_date = current_date and status = 'pending'), 1, 'a status built today queues one morning job');
select is((select count(*)::int from public.ai_jobs where for_date = date '2026-01-05'), 0, 'an old day queues nothing');
select is((select count(*)::int from public.ai_jobs where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'), 0,
  'a day with no status queues nothing');
select is((select count(*)::int from public.ai_jobs where user_id = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'), 0,
  'a person who has not agreed to the AI queues nothing');

-- A recalculated status queues the job again.
update public.ai_jobs set status = 'done', attempts = 1 where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
delete from public.daily_status where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' and date = current_date;
insert into public.daily_status (user_id, date, status, no_status_reason, readings_used, points, total, nudge, settings_version)
values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', current_date, 'rest', null, 3, '{}', 2.6, 'rest', 3);
select is((select status || '/' || attempts from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'
              and kind = 'morning' and for_date = current_date), 'pending/0', 'a recalculated status starts the job over');

-- Claiming: once, with the attempt counted; a stuck job can be claimed again.
select is((select count(*)::int from public.ai_claim_jobs(5)), 1, 'claiming returns the pending job');
select is((select status || '/' || attempts from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'
              and kind = 'morning' and for_date = current_date), 'running/1', 'which is now running, one attempt');
select is((select count(*)::int from public.ai_claim_jobs(5)), 0, 'a second claim finds nothing');
update public.ai_jobs set started_at = now() - interval '5 minutes' where status = 'running';
select is((select count(*)::int from public.ai_claim_jobs(5)), 1, 'a job stuck running for minutes is claimed again');

-- Failing: back to pending until three tries, then failed.
select public.ai_fail('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'morning', current_date, 'timeout');
select is((select status from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' and kind = 'morning'), 'pending',
  'a first failure leaves it to try again');
update public.ai_jobs set attempts = 3 where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' and kind = 'morning';
select public.ai_fail('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'morning', current_date, 'filtered');
select is((select status || '/' || last_error from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'
              and kind = 'morning'), 'failed/filtered', 'the third failure ends it, with the reason');

-- ------------------------------------------------------------------ the texts
select public.ai_finish('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'morning', current_date);
select is((select status from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' and kind = 'morning'), 'done',
  'a text already on file finishes the job without writing again');
select public.ai_save('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'morning', current_date,
                      '{"explanation": "A made-up explanation."}'::jsonb, 'claude-opus-5-5', 'v1', 'hash1', 'rest', 'rest', 1, 4200, 700, 90);
select is((select status from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1' and kind = 'morning'), 'done',
  'saving a text finishes the job');
select is((select status || '/' || nudge || '/' || model from public.ai_texts where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  'rest/rest/claude-opus-5-5', 'the text is saved with the status it was written for, and the model');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1", "role": "authenticated"}', true);
select is((select count(*)::int from public.ai_texts), 1, 'the person reads their own text');
select throws_ok($$select * from public.ai_jobs$$, '42501', null, 'but the job queue is closed to people');
select throws_ok($$update public.ai_texts set body = '{}'::jsonb$$, '42501', null, 'and they cannot change a text');
select set_config('request.jwt.claims', '{"sub": "c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2", "role": "authenticated"}', true);
select is((select count(*)::int from public.ai_texts), 0, 'another person sees none of it');
reset role;

-- ----------------------------------------------------------------- clearing
select public.delete_my_data('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1');
select is((select count(*)::int from public.ai_texts where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1')
        + (select count(*)::int from public.ai_jobs where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'), 0,
  'Delete my data clears the saved texts and the jobs');

-- ----------------------------------------------------------- the digest input
-- A Monday well in the past (nothing here is near today).
insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                           sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count,
                           resting_hr_prev_day, coverage, confidence)
select 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', d::date, -300, d - interval '7 hours', d + interval '6 hours', 400, true,
       56, 60, 48, 3, 15, 30, 58, 1, 'high'
  from generate_series(date '2026-08-03', date '2026-08-09', interval '1 day') as d;
insert into public.shown_status (user_id, date, via, status, nudge, readings_used, settings_version)
values ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '2026-08-03', 'card', 'ready', 'train_as_planned', 3, 3);
insert into public.checkins (user_id, date, answer, is_first, status_seen_before)
values ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '2026-08-03', 'good', true, false);
select is(public.ai_digest_input('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '2026-08-03') -> 'days' -> 0 ->> 'weekday', 'Monday',
  'the digest input names days by weekday');
select is(public.ai_digest_input('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '2026-08-03') -> 'days' -> 0 ->> 'checkin', 'great',
  'a check-in saved as good is written as great');
select is((select string_agg(k, ',' order by k) from jsonb_object_keys(
              public.ai_digest_input('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '2026-08-03') -> 'days' -> 0) k),
  'checkin,followed,hrv,nudge,sleep,sleeping_hr,status,weekday', 'each day has only the allowed fields');
select is(public.ai_digest_input('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '2026-08-03') ->> 'prior_weeks', '[]',
  'with no earlier weeks the prior weeks are empty');

select * from finish();
rollback;
