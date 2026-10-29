-- D94, D95, D96: AI explanations. Consent version 3 (agreeing to the AI is
-- required, R68), the queue of texts to write, the texts themselves, and the
-- digest's input. The score still sets the status; the AI only explains it
-- (R69). Release order: back up, then this, then the functions, then the app
-- asks everyone to agree to version 3.

-- ------------------------------------------------------------- consent v3
alter table public.consents add column agreed_ai boolean not null default false;
-- From version 3 the AI agreement is part of consent; older rows keep false.
alter table public.consents add constraint consents_ai_from_v3 check (version < 3 or agreed_ai);

-- Stable, not immutable: it reads nothing but a constant, yet an immutable
-- function can be baked into cached plans (Phase 6 code review).
create or replace function public.consent_version()
returns integer
language sql
stable
set search_path = ''
as $$ select 3 $$;

-- Agreeing now takes all three statements.
drop function public.give_consent(integer, boolean, boolean);
create function public.give_consent(p_version integer, p_use boolean, p_us_storage boolean, p_ai boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_at timestamptz;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_use is not true or p_us_storage is not true or p_ai is not true then
    raise exception 'all three agreements are needed' using errcode = '22023';
  end if;
  if p_version is null or p_version < public.consent_version() then
    raise exception 'that consent text is out of date' using errcode = '22023';
  end if;
  select agreed_at into v_at from public.consents
   where user_id = v_user and ended_at is null and version >= p_version;
  if found then
    return v_at;
  end if;
  update public.consents set ended_at = now(), ended_why = 'new_version'
   where user_id = v_user and ended_at is null;
  insert into public.consents (user_id, version, agreed_use, agreed_us_storage, agreed_ai)
  values (v_user, p_version, true, true, true)
  returning agreed_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.give_consent(integer, boolean, boolean, boolean) from public, anon;
grant execute on function public.give_consent(integer, boolean, boolean, boolean) to authenticated;

-- ------------------------------------------------------------ the queue
-- One job per person, kind and day. Nobody reads or writes it from the app.
create table public.ai_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('morning', 'digest')),
  for_date date not null,  -- the morning's date, or the digest's Monday
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  primary key (user_id, kind, for_date)
);
alter table public.ai_jobs enable row level security;
revoke all on public.ai_jobs from anon, authenticated;

-- The texts the AI wrote, kept only after the filter passed them (R73, R74).
-- `status` and `nudge` are what the text was written for: the card shows it
-- only while they still match the day's status.
create table public.ai_texts (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('morning', 'digest')),
  for_date date not null,
  body jsonb not null,           -- morning: {"explanation": ...}; digest: {"sentences": ..., "patterns": [...]}
  model text not null,
  instruction_version text not null,
  input_hash text not null,      -- the input's hash, never the input
  status text,
  nudge text,
  tries integer not null,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, for_date)
);
alter table public.ai_texts enable row level security;
create policy "ai_texts: read own" on public.ai_texts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_texts from anon, authenticated;
grant select on public.ai_texts to authenticated;

-- Queue a job for a person who has agreed to the AI (version 3 and in force).
-- True when a job was queued (or queued again).
create function public.ai_enqueue(p_user uuid, p_kind text, p_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.consents
                  where user_id = p_user and ended_at is null and agreed_ai and version >= public.consent_version()) then
    return false;
  end if;
  insert into public.ai_jobs (user_id, kind, for_date) values (p_user, p_kind, p_date)
  on conflict (user_id, kind, for_date) do update
    set status = 'pending', attempts = 0, started_at = null, finished_at = null, last_error = null;
  return true;
end;
$$;

-- Claim up to p_limit jobs: pending ones, and ones stuck running for 2 minutes.
create function public.ai_claim_jobs(p_limit integer)
returns table (user_id uuid, kind text, for_date date)
language sql
security definer
set search_path = ''
as $$
  with picked as (
    select j.user_id, j.kind, j.for_date from public.ai_jobs j
     where j.status = 'pending' or (j.status = 'running' and j.started_at < now() - interval '2 minutes')
     order by j.created_at
     limit greatest(1, p_limit)
       for update skip locked
  )
  update public.ai_jobs j
     set status = 'running', attempts = j.attempts + 1, started_at = now()
    from picked
   where j.user_id = picked.user_id and j.kind = picked.kind and j.for_date = picked.for_date
  returning j.user_id, j.kind, j.for_date;
$$;

-- A try failed: pending again until the third try, then failed with the reason
-- (a short code such as timeout or filtered, never the text).
create function public.ai_fail(p_user uuid, p_kind text, p_date date, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_jobs
     set status = case when attempts >= 3 then 'failed' else 'pending' end,
         last_error = left(p_error, 80),
         finished_at = case when attempts >= 3 then now() end
   where user_id = p_user and kind = p_kind and for_date = p_date;
$$;

-- The text already on file is still right (same input, same status): finish
-- the job without writing again.
create function public.ai_finish(p_user uuid, p_kind text, p_date date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_jobs set status = 'done', finished_at = now(), last_error = null
   where user_id = p_user and kind = p_kind and for_date = p_date;
$$;

-- A text passed the filter: keep it and finish the job.
create function public.ai_save(p_user uuid, p_kind text, p_date date, p_body jsonb, p_model text, p_instruction text,
                               p_hash text, p_status text, p_nudge text, p_tries integer, p_latency_ms integer,
                               p_input_tokens integer, p_output_tokens integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_texts (user_id, kind, for_date, body, model, instruction_version, input_hash, status, nudge,
                               tries, latency_ms, input_tokens, output_tokens)
  values (p_user, p_kind, p_date, p_body, p_model, p_instruction, p_hash, p_status, p_nudge, p_tries, p_latency_ms,
          p_input_tokens, p_output_tokens)
  on conflict (user_id, kind, for_date) do update
    set body = excluded.body, model = excluded.model, instruction_version = excluded.instruction_version,
        input_hash = excluded.input_hash, status = excluded.status, nudge = excluded.nudge, tries = excluded.tries,
        latency_ms = excluded.latency_ms, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
        created_at = now();
  update public.ai_jobs set status = 'done', finished_at = now(), last_error = null
   where user_id = p_user and kind = p_kind and for_date = p_date;
end;
$$;

-- Start the writer, only when something is waiting. It calls ai-explain with
-- the cron key from Vault, like the notification sender (D66).
create function public.ai_start()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_url text;
begin
  if not exists (select 1 from public.ai_jobs
                  where status = 'pending' or (status = 'running' and started_at < now() - interval '2 minutes')) then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'clarivi_cron_key';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'clarivi_functions_url';
  if v_key is null or v_url is null then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/ai-explain',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clarivi-cron', v_key),
    body := '{"kind": "run"}'::jsonb,
    timeout_milliseconds := 120000);
end;
$$;

-- A status built for a recent day queues its morning text at once; the
-- every-minute job below is the backup (R70).
create function public.ai_on_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('ready', 'ease_off', 'rest') and new.date >= (now() at time zone 'utc')::date - 2 then
    if public.ai_enqueue(new.user_id, 'morning', new.date) then
      perform public.ai_start();
    end if;
  end if;
  return null;
end;
$$;
create trigger ai_on_status after insert on public.daily_status
  for each row execute function public.ai_on_status();

create function public.ai_on_digest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.ai_enqueue(new.user_id, 'digest', new.week_start) then
    perform public.ai_start();
  end if;
  return null;
end;
$$;
create trigger ai_on_digest after insert on public.digests
  for each row execute function public.ai_on_digest();

select cron.schedule('run-ai', '* * * * *', 'select public.ai_start()');

-- ---------------------------------------------------- the digest's input
-- What the AI may see of a week (R72, docs/ai-eval/README.md): seven days of
-- weekday, status as shown, nudge, whether it was followed, the check-in and
-- the three readings; and up to eight earlier weeks as totals only, labelled
-- "last week", "2 weeks ago" and so on. No dates, no names.
create function public.ai_digest_input(p_user uuid, p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with shown as (
    select distinct on (s.date) s.date, s.status, s.nudge
      from public.shown_status s
     where s.user_id = p_user and s.date between p_week_start - 56 and p_week_start + 6
     order by s.date, s.shown_at
  ), answers as (
    select distinct on (f.date) f.date, f.answer
      from public.followthrough f
     where f.user_id = p_user and f.date between p_week_start and p_week_start + 6
     order by f.date, f.answered_at desc
  ), first_checkin as (
    select distinct on (c.date) c.date, c.answer
      from public.checkins c
     where c.user_id = p_user and c.date between p_week_start - 56 and p_week_start + 6
     order by c.date, c.answered_at
  ), per_day as (
    select d.day,
           coalesce(sh.status, nullif(ds.status, 'none')) as status,
           coalesce(sh.nudge, ds.nudge) as nudge,
           a.answer as followed,
           case fc.answer when 'good' then 'great' when 'okay' then 'okay' when 'off' then 'off' else 'skipped' end as checkin,
           n.hrv_median, n.sleeping_hr, n.asleep_min
      from generate_series(p_week_start - 56, p_week_start + 6, interval '1 day') as g (day)
     cross join lateral (select g.day::date as day) d
      left join shown sh on sh.date = d.day
      left join public.daily_status ds on ds.user_id = p_user and ds.date = d.day
      left join answers a on a.date = d.day
      left join first_checkin fc on fc.date = d.day
      left join public.nights n on n.user_id = p_user and n.night_date = d.day
  ), this_week as (
    select jsonb_agg(jsonb_build_object(
             'weekday', trim(to_char(day, 'Day')),
             'status', coalesce(status, 'none'),
             'nudge', coalesce(nudge, 'none'),
             'followed', case followed when 'yes' then 'yes' when 'no' then 'no' else 'none' end,
             'checkin', checkin,
             'hrv', round(hrv_median),
             'sleeping_hr', round(sleeping_hr),
             'sleep', round(asleep_min)) order by day) as days
      from per_day where day >= p_week_start
  ), earlier as (
    select k, jsonb_build_object(
             'label', case k when 1 then 'last week' else k || ' weeks ago' end,
             'ready', count(*) filter (where status = 'ready'),
             'ease_off', count(*) filter (where status = 'ease_off'),
             'rest', count(*) filter (where status = 'rest'),
             'avg_hrv', round(avg(hrv_median)),
             'avg_sleeping_hr', round(avg(sleeping_hr)),
             'avg_sleep', round(avg(asleep_min)),
             'checkins', jsonb_build_object(
               'great', count(*) filter (where checkin = 'great'),
               'okay', count(*) filter (where checkin = 'okay'),
               'off', count(*) filter (where checkin = 'off'))) as w
      from generate_series(1, 8) as k
     cross join lateral (select * from per_day where day >= p_week_start - 7 * k and day < p_week_start - 7 * k + 7) x
     group by k
    having count(x.hrv_median) + count(x.asleep_min) > 0
  )
  select jsonb_build_object(
           'kind', 'digest',
           'days', (select days from this_week),
           'prior_weeks', coalesce((select jsonb_agg(w order by k) from earlier), '[]'::jsonb));
$$;

-- Server only, like the other AI functions.
revoke all on function public.ai_enqueue(uuid, text, date), public.ai_claim_jobs(integer), public.ai_finish(uuid, text, date),
  public.ai_fail(uuid, text, date, text), public.ai_start(), public.ai_on_status(), public.ai_on_digest(),
  public.ai_digest_input(uuid, date),
  public.ai_save(uuid, text, date, jsonb, text, text, text, text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ai_enqueue(uuid, text, date), public.ai_claim_jobs(integer), public.ai_finish(uuid, text, date),
  public.ai_fail(uuid, text, date, text), public.ai_start(), public.ai_digest_input(uuid, date),
  public.ai_save(uuid, text, date, jsonb, text, text, text, text, text, integer, integer, integer, integer)
  to service_role;
