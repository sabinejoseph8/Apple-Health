-- Phase 5: "Delete my data" (R59) removes every reading, result, answer,
-- log, token and notification registration for that person only, and keeps
-- the account. Made-up accounts and data only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('51515151-5151-5151-5151-515151515151', 'tester-u@example.test'),
  ('52525252-5252-5252-5252-525252525252', 'tester-v@example.test');
update public.profiles set latest_tz_offset_min = -300
 where user_id in ('51515151-5151-5151-5151-515151515151', '52525252-5252-5252-5252-525252525252');

-- Some of everything, for both people.
create function pg_temp.fill(p_user uuid, p_n integer) returns void language plpgsql as $$
declare
  v_token uuid;
  v_upload uuid;
begin
  insert into public.upload_tokens (user_id, token_hash) values (p_user, encode(sha256(convert_to('token-' || p_n, 'UTF8')), 'hex')) returning id into v_token;
  insert into public.uploads (user_id, token_id, schema_version, kind, device_tz_offset_min, local_date, status)
  values (p_user, v_token, 1, 'daily', -300, '2026-09-29', 'accepted') returning id into v_upload;
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, unit, source_name, sample_hash)
  values (p_user, v_upload, 'heart_rate', '2026-09-29 01:00-05', '2026-09-29 01:00-05', -300, 50, 'count/min', 'Watch',
          sha256(convert_to('hr' || p_n, 'UTF8')));
  insert into public.nights (user_id, night_date, tz_offset_min, sleep_start, sleep_end, asleep_min, finished,
                             sleeping_hr, sleeping_hr_count, hrv_median, hrv_count, resp_rate, resp_count, coverage, confidence)
  values (p_user, '2026-09-29', -300, '2026-09-28 23:00-05', '2026-09-29 06:30-05', 430, true, 50, 60, 52, 3, 15, 30, 1, 'high');
  insert into public.baselines (user_id, night_date, metric, valid_nights, building) values (p_user, '2026-09-29', 'hrv', 10, true);
  insert into public.daily_status (user_id, date, status, no_status_reason, readings_used, points, settings_version)
  values (p_user, '2026-09-29', 'none', 'learning', 0, '{}', 2);
  insert into public.insights (user_id, date, module, metric, severity, explanation_code)
  values (p_user, '2026-09-29', 'readiness', 'hrv', 'building', 'hrv_building');
  insert into public.analysis_queue (user_id, from_date, to_date, reason) values (p_user, '2026-09-29', '2026-09-29', 'daily');
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (p_user, 'https://push.example/' || p_n, 'k', 'a');
  insert into public.checkins (user_id, date, answer, status_seen_before, is_first) values (p_user, '2026-09-29', 'okay', false, true);
  insert into public.usage_events (user_id, event, meta) values (p_user, 'card_view', '{}');
  insert into public.notifications (user_id, date, kind, expires_at) values (p_user, '2026-09-29', 'morning', now());
  insert into public.shown_status (user_id, date, via, status, nudge, readings_used, settings_version)
  values (p_user, '2026-09-29', 'card', 'ease_off', 'train_easy', 3, 2);
  insert into public.followthrough (user_id, date, answer, channel) values (p_user, '2026-09-29', 'yes', 'card');
  insert into public.events (user_id, date, type) values (p_user, '2026-09-29', 'travel');
  insert into public.workouts (user_id, activity, start_at, end_at, tz_offset_min, duration_min)
  values (p_user, 'running', '2026-09-29 07:00-05', '2026-09-29 07:30-05', -300, 30);
end;
$$;
select pg_temp.fill('51515151-5151-5151-5151-515151515151', 1);
select pg_temp.fill('52525252-5252-5252-5252-525252525252', 2);

-- How many rows a person has across every table with a user_id (but the profile).
create function pg_temp.rows_for(p_user uuid) returns integer language plpgsql as $$
declare
  v_table text;
  v_count integer;
  v_total integer := 0;
begin
  for v_table in
    select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE' and c.table_name <> 'profiles'
  loop
    execute format('select count(*) from public.%I where user_id = $1', v_table) into v_count using p_user;
    v_total := v_total + v_count;
  end loop;
  return v_total;
end;
$$;

create temp table before as select pg_temp.rows_for('51515151-5151-5151-5151-515151515151') as u,
                                   pg_temp.rows_for('52525252-5252-5252-5252-525252525252') as v;
select cmp_ok((select u from before), '>=', 16, 'tester U has data in each of the 16 kinds of table');
select is(public.delete_my_data('51515151-5151-5151-5151-515151515151'), (select u from before),
  'delete my data removes every row it finds');
select is(pg_temp.rows_for('51515151-5151-5151-5151-515151515151'), 0, 'nothing is left for tester U, in any table (R59)');
select is(pg_temp.rows_for('52525252-5252-5252-5252-525252525252'), (select v from before), 'tester V keeps all of theirs');
select is((select count(*)::int from public.profiles where user_id = '51515151-5151-5151-5151-515151515151'), 1, 'the account stays');
select is((select count(*)::int from auth.users where id = '51515151-5151-5151-5151-515151515151'), 1, 'and can still sign in');

set local role authenticated;
set local request.jwt.claims = '{"sub": "52525252-5252-5252-5252-525252525252", "role": "authenticated"}';
select throws_ok($$select public.delete_my_data('51515151-5151-5151-5151-515151515151')$$, '42501', null,
  'a signed-in user cannot call it directly (only the function, after the password check)');
reset role;
set local role anon;
select throws_ok($$select public.delete_my_data('52525252-5252-5252-5252-525252525252')$$, '42501', null, 'nor can anyone else');
reset role;

select * from finish();
rollback;
