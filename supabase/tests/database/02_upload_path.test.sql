-- Upload path tests (tech-spec section 8): one user's token can't write rows
-- for another user, no token can read data, posting the same readings twice
-- stores them once, the reply flags are right, and replaced tokens, bad
-- bodies and too many posts are refused.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.test');

-- A time zone offset that makes the phone's local time 8am right now, so the
-- "last night" tests give the same answer whenever they run.
create function pg_temp.off() returns integer language sql as $$
  select ((480 - (extract(hour from now() at time zone 'utc') * 60
                  + extract(minute from now() at time zone 'utc'))::integer + 2160) % 1440) - 720
$$;

create function pg_temp.body(p_kind text, p_samples jsonb, p_month text default null) returns jsonb language sql as $$
  select jsonb_build_object('schema_version', 1, 'kind', p_kind, 'month_id', p_month,
                            'device_tz_offset_min', pg_temp.off(), 'trigger', 'charger', 'samples', p_samples)
$$;

create function pg_temp.sleep(p_stage text, p_start timestamptz, p_end timestamptz) returns jsonb language sql as $$
  select jsonb_build_object('type', 'sleep_stage', 'start_at', p_start, 'end_at', p_end,
                            'tz_offset_min', pg_temp.off(), 'stage', p_stage, 'source_name', 'Test Watch')
$$;

create function pg_temp.reading(p_type text, p_at timestamptz, p_value double precision, p_unit text) returns jsonb language sql as $$
  select jsonb_build_object('type', p_type, 'start_at', p_at, 'end_at', p_at, 'tz_offset_min', pg_temp.off(),
                            'value', p_value, 'unit', p_unit, 'source_name', 'Test Watch')
$$;

select lives_ok($$select public.issue_upload_token('11111111-1111-1111-1111-111111111111', repeat('a', 64))$$,
  'an upload token can be issued for user A');
select lives_ok($$select public.issue_upload_token('22222222-2222-2222-2222-222222222222', repeat('b', 64))$$,
  'an upload token can be issued for user B');

-- User A's morning post: a finished night (last asleep reading ended an hour ago).
create temp table r1 as
select public.ingest_upload(repeat('a', 64), pg_temp.body('daily', jsonb_build_array(
  pg_temp.reading('heart_rate', now() - interval '3 hours', 55, 'count/min'),
  pg_temp.reading('heart_rate', now() - interval '2 hours', 52, 'count/min'),
  pg_temp.reading('hrv_sdnn', now() - interval '2 hours', 45, 'ms'),
  pg_temp.sleep('core', now() - interval '8 hours', now() - interval '2 hours'),
  pg_temp.sleep('rem', now() - interval '2 hours', now() - interval '1 hour'),
  pg_temp.sleep('awake', now() - interval '1 hour', now() - interval '55 minutes')
))) as r;

select is((select (r ->> 'accepted')::int from r1), 6, 'a first post stores every reading');
select is((select (r ->> 'duplicates')::int from r1), 0, 'a first post has no duplicates');
select is((select (r ->> 'night_complete')::boolean from r1), true,
  'a night whose last asleep reading ended an hour ago is complete');
select is((select (r ->> 'already_complete_today')::boolean from r1), false,
  'the first complete post of the day was not already complete');
select is((select array_agg(k order by k) from r1, jsonb_object_keys(r) as k),
  array['accepted', 'already_complete_today', 'duplicates', 'night_complete'],
  'the reply holds counts and flags only, never readings');

-- The same post again.
create temp table r2 as
select public.ingest_upload(repeat('a', 64), pg_temp.body('daily', jsonb_build_array(
  pg_temp.reading('heart_rate', now() - interval '3 hours', 55, 'count/min'),
  pg_temp.reading('heart_rate', now() - interval '2 hours', 52, 'count/min'),
  pg_temp.reading('hrv_sdnn', now() - interval '2 hours', 45, 'ms'),
  pg_temp.sleep('core', now() - interval '8 hours', now() - interval '2 hours'),
  pg_temp.sleep('rem', now() - interval '2 hours', now() - interval '1 hour'),
  pg_temp.sleep('awake', now() - interval '1 hour', now() - interval '55 minutes')
))) as r;

select is((select (r ->> 'accepted')::int from r2), 0, 'posting the same readings again stores nothing new');
select is((select (r ->> 'duplicates')::int from r2), 6, 'the repeated readings are counted as duplicates');
select is((select (r ->> 'already_complete_today')::boolean from r2), true,
  'a second post on the same morning sees the night was already complete');
select is((select count(*)::int from public.samples where user_id = '11111111-1111-1111-1111-111111111111'), 6,
  'posting the same readings twice stores them once');
select is((select max(duplicate_count) from public.uploads where user_id = '11111111-1111-1111-1111-111111111111'), 6,
  'the upload log records the duplicates');

select is((public.ingest_upload(repeat('a', 64), pg_temp.body('ping', '[]')) ->> 'already_complete_today')::boolean, true,
  'a ping after a complete night tells the Shortcut to stop');

-- User B: the night isn't finished yet (last asleep reading ended 5 minutes ago).
create temp table r3 as
select public.ingest_upload(repeat('b', 64), pg_temp.body('daily', jsonb_build_array(
  pg_temp.sleep('core', now() - interval '6 hours', now() - interval '5 minutes')
))) as r;

select is((select (r ->> 'night_complete')::boolean from r3), false,
  'a night whose last asleep reading ended under 10 minutes ago is not complete yet');
select is((public.ingest_upload(repeat('b', 64), pg_temp.body('ping', '[]')) ->> 'already_complete_today')::boolean, false,
  'a partial night never counts as synced');
select is((public.ingest_upload(repeat('b', 64), pg_temp.body('backfill', jsonb_build_array(
            pg_temp.sleep('deep', now() - interval '8 hours', now() - interval '2 hours')),
            to_char(now(), 'YYYY-MM'))) ->> 'night_complete')::boolean, false,
  'an import never completes today''s night');

-- A user id in the body is ignored: the user always comes from the token.
select is((public.ingest_upload(repeat('b', 64),
            pg_temp.body('daily', jsonb_build_array(
              pg_temp.reading('heart_rate', now() - interval '4 hours', 60, 'count/min')
                || '{"user_id": "11111111-1111-1111-1111-111111111111"}'))
            || '{"user_id": "11111111-1111-1111-1111-111111111111"}') ->> 'accepted')::int, 1,
  'user B can post with their own token');
select is((select count(*)::int from public.samples where user_id = '11111111-1111-1111-1111-111111111111'), 6,
  'user B''s token cannot write rows for user A, even with A''s id in the body');
select is((select count(*)::int from public.samples where user_id = '22222222-2222-2222-2222-222222222222'), 3,
  'user B''s readings are stored under user B');
select is((select count(*)::int from public.samples s join public.uploads u on u.id = s.upload_id
            where s.user_id <> u.user_id), 0,
  'every reading belongs to the same user as its upload');

select is((select latest_tz_offset_min from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  pg_temp.off(), 'each post records the phone''s latest time zone');

-- Unknown and replaced tokens.
select is(public.ingest_upload(repeat('c', 64), pg_temp.body('ping', '[]')) ->> 'error', 'invalid_token',
  'an unknown token is rejected');
select lives_ok($$select public.issue_upload_token('11111111-1111-1111-1111-111111111111', repeat('d', 64))$$,
  'user A''s token can be reissued');
select is(public.ingest_upload(repeat('a', 64), pg_temp.body('ping', '[]')) ->> 'error', 'token_revoked',
  'the old token stops working at once');
select is((select count(*)::int from public.uploads
            where user_id = '11111111-1111-1111-1111-111111111111' and status = 'rejected' and error = 'token_revoked'), 1,
  'a post with a replaced token is logged as rejected');
select is(public.ingest_upload(repeat('d', 64), pg_temp.body('ping', '[]')) ->> 'error', null,
  'the new token works');
select is((select count(*)::int from public.upload_tokens
            where user_id = '11111111-1111-1111-1111-111111111111' and revoked_at is null), 1,
  'a user has only one working token');
select is((select last_used_at is not null from public.upload_tokens where token_hash = repeat('d', 64)), true,
  'a token''s last use is recorded');

-- Readings the server function set aside are counted on the upload row.
select is((public.ingest_upload(repeat('d', 64), pg_temp.body('daily', jsonb_build_array(
            pg_temp.reading('heart_rate', now() - interval '3 hours', 55, 'count/min')))
            || '{"set_aside": 2, "set_aside_note": "sample 2 (heart_rate): value out of range"}') ->> 'duplicates')::int, 1,
  'a post with readings set aside still stores the rest');
select is((select set_aside_count from public.uploads where set_aside_note like 'sample 2%'), 2,
  'the upload row records how many readings were set aside, and why');

-- A body the server function rejected is logged against the token's user.
select is(public.ingest_upload(repeat('d', 64), null, 'sample 3: unknown type') ->> 'error', 'invalid_body',
  'a rejected body gets an error reply');
select is((select count(*)::int from public.uploads
            where user_id = '11111111-1111-1111-1111-111111111111' and error = 'sample 3: unknown type'), 1,
  'a rejected body is logged');

-- Rate limit: 60 posts an hour per token.
insert into public.uploads (user_id, token_id, status, error)
select '22222222-2222-2222-2222-222222222222', id, 'rejected', 'test'
  from public.upload_tokens, generate_series(1, 60)
 where token_hash = repeat('b', 64);
select is(public.ingest_upload(repeat('b', 64), pg_temp.body('daily', '[]')) ->> 'error', 'rate_limited',
  'more than 60 daily posts an hour from one token are refused');

-- Act as user A in the app.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select is((select count(*)::int from public.samples), 6, 'user A sees only their own readings');
select is((select count(distinct user_id)::int from public.uploads), 1, 'user A sees only their own uploads');
select is((select count(*)::int from public.upload_tokens), 2, 'user A sees only their own tokens');
select lives_ok('select created_at, last_used_at, revoked_at from public.upload_tokens',
  'the app can see when its token was made and last used');
select throws_ok('select token_hash from public.upload_tokens', '42501', null,
  'the app can never read a token hash');
select throws_ok('update public.samples set value = 1', '42501', null, 'readings cannot be changed');
select throws_ok('delete from public.samples', '42501', null, 'readings cannot be deleted directly');
select throws_ok($$insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, sample_hash)
                   values ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'heart_rate', now(), now(), 0, 60, '\x00')$$,
  '42501', null, 'user A cannot add readings directly');
select throws_ok($$insert into public.upload_tokens (user_id, token_hash) values ('11111111-1111-1111-1111-111111111111', repeat('e', 64))$$,
  '42501', null, 'user A cannot add a token directly');
select throws_ok($$select public.ingest_upload(repeat('d', 64), '{}'::jsonb)$$, '42501', null,
  'a signed-in user cannot call the upload path directly');
select throws_ok($$select public.issue_upload_token('11111111-1111-1111-1111-111111111111', repeat('e', 64))$$, '42501', null,
  'a signed-in user cannot issue a token without the server function');

-- Not signed in.
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok('select 1 from public.samples', '42501', null, 'someone not signed in cannot read readings');
select throws_ok('select 1 from public.upload_tokens', '42501', null, 'someone not signed in cannot read tokens');
select throws_ok($$select public.ingest_upload(repeat('d', 64), '{}'::jsonb)$$, '42501', null,
  'someone not signed in cannot call the upload path directly');

reset role;
select * from finish();
rollback;
