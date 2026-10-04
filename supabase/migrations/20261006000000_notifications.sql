-- Phase 4: notifications and follow-through (R47 to R56, D32, D34, D61,
-- D66 to D68). Adds the outbox, what each person was shown, follow-through
-- answers, the morning queueing, the 5-minute planner and the every-minute
-- call to the sender. Only adds things; run_analysis_queue gains one call.

create extension if not exists pg_net with schema extensions;

-- The outbox: at most one notification of each kind per person per day
-- (tech-spec pattern 5). The sender writes the text when it sends, from the
-- wording module, so no words live here.
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The person's local date the notification belongs to.
  date date not null,
  kind text not null check (kind in ('morning', 'reminder', 'followup')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'expired')),
  created_at timestamptz not null default now(),
  -- Not sent after this: noon for the morning and the reminder, midnight
  -- for the 8pm question, in the person's local time.
  expires_at timestamptz not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  devices integer,
  tapped_at timestamptz,
  error text,
  unique (user_id, date, kind)
);

create index notifications_due on public.notifications (created_at) where status = 'pending';

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- What each person was shown (D61): the status, nudge and reason, saved when
-- the morning notification is sent and when the card first shows a status.
-- Never updated, so a later recalculation can't change what was shown.
create table public.shown_status (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  via text not null check (via in ('notification', 'card')),
  status text not null check (status in ('ready', 'ease_off', 'rest')),
  nudge text not null check (nudge in ('train_as_planned', 'train_easy', 'rest', 'prioritise_sleep')),
  reason_codes text[] not null default '{}',
  readings_used integer not null,
  total numeric,
  settings_version integer not null,
  shown_at timestamptz not null default now(),
  primary key (user_id, date, via)
);

alter table public.shown_status enable row level security;

create policy "shown status: read own"
  on public.shown_status for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.shown_status from anon, authenticated;
grant select on public.shown_status to authenticated;

-- Follow-through answers (R52 to R56): every answer is kept, with its time
-- and where it was given.
create table public.followthrough (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  answer text not null check (answer in ('yes', 'no')),
  answered_at timestamptz not null default now(),
  channel text not null check (channel in ('push', 'card', 'next_morning'))
);

create index followthrough_user_date on public.followthrough (user_id, date, answered_at desc);

alter table public.followthrough enable row level security;

create policy "followthrough: read own"
  on public.followthrough for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.followthrough from anon, authenticated;
grant select on public.followthrough to authenticated;

-- A person's local time, from the offset of their latest sync.
create function public.local_now(p_user uuid, p_now timestamptz default now())
returns timestamp
language sql
stable
security definer
set search_path = ''
as $$
  select (p_now at time zone 'utc') + p.latest_tz_offset_min * interval '1 minute'
    from public.profiles p
   where p.user_id = p_user and p.latest_tz_offset_min is not null
$$;

-- A local date and time of day as a moment, in the person's offset.
create function public.local_moment(p_user uuid, p_date date, p_time time)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_date + p_time) - p.latest_tz_offset_min * interval '1 minute') at time zone 'utc'
    from public.profiles p
   where p.user_id = p_user and p.latest_tz_offset_min is not null
$$;

-- The day's change nudge as first shown, if it asked for a change.
create function public.shown_change_nudge(p_user uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.nudge
    from public.shown_status s
   where s.user_id = p_user and s.date = p_date and s.nudge <> 'train_as_planned'
   order by s.shown_at
   limit 1
$$;

-- Queues today's morning notification after the analysis (R48): only on a
-- day with a status, from a sync that completed last night before local
-- noon (R29). The unique key keeps it to one, however often this runs.
create function public.queue_morning_notification(p_user uuid, p_now timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := public.local_now(p_user, p_now);
  v_today date := v_local::date;
  v_synced timestamptz;
begin
  if v_local is null then
    return false;
  end if;
  if not exists (select 1 from public.daily_status d where d.user_id = p_user and d.date = v_today and d.status <> 'none') then
    return false;
  end if;
  -- The sync the card shows: the one that completed the night, or the latest.
  select coalesce(min(u.received_at) filter (where u.night_complete), max(u.received_at)) into v_synced
    from public.uploads u
   where u.user_id = p_user and u.status = 'accepted' and u.kind = 'daily' and u.local_date = v_today;
  if v_synced is null or v_synced >= public.local_moment(p_user, v_today, '12:00') then
    return false;
  end if;
  insert into public.notifications (user_id, date, kind, expires_at)
  values (p_user, v_today, 'morning', public.local_moment(p_user, v_today, '12:00'))
  on conflict (user_id, date, kind) do nothing;
  return found;
end;
$$;

-- Every 5 minutes (tech-spec, Schedulers): the 11:30 reminder when nothing
-- has synced (R49, D34) and the 8pm question on change days (R50, D32), by
-- each person's local time. p_now is for tests.
create function public.plan_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
  v_local timestamp;
  v_count integer := 0;
begin
  for v_person in
    select p.user_id
      from public.profiles p
     where p.latest_tz_offset_min is not null
       -- Only people who sync: an accepted post in the last two weeks.
       and exists (select 1 from public.uploads u
                    where u.user_id = p.user_id and u.status = 'accepted' and u.received_at > p_now - interval '14 days')
  loop
    v_local := public.local_now(v_person.user_id, p_now);

    if v_local::time >= '11:30' and v_local::time < '12:00'
       and not exists (select 1 from public.uploads u
                        where u.user_id = v_person.user_id and u.status = 'accepted' and u.kind = 'daily'
                          and u.local_date = v_local::date) then
      insert into public.notifications (user_id, date, kind, expires_at)
      values (v_person.user_id, v_local::date, 'reminder', public.local_moment(v_person.user_id, v_local::date, '12:00'))
      on conflict (user_id, date, kind) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;

    -- Not when the day has already been answered on the card.
    if v_local::time >= '20:00' and public.shown_change_nudge(v_person.user_id, v_local::date) is not null
       and not exists (select 1 from public.followthrough f
                        where f.user_id = v_person.user_id and f.date = v_local::date) then
      insert into public.notifications (user_id, date, kind, expires_at)
      values (v_person.user_id, v_local::date, 'followup',
              public.local_moment(v_person.user_id, v_local::date + 1, '00:00'))
      on conflict (user_id, date, kind) do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;
  return v_count;
end;
$$;

-- The sender takes due notifications, so two runs never send one twice;
-- anything past its time is marked expired instead (service role only).
create function public.claim_due_notifications(p_limit integer default 50)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set status = 'expired'
   where status = 'pending' and expires_at <= now();
  -- A claim left by a sender that stopped may already have been delivered,
  -- so it is marked failed rather than sent again (at most one, R48).
  update public.notifications set status = 'failed', error = 'sender_stopped'
   where status = 'sending' and claimed_at < now() - interval '5 minutes';
  return query
    update public.notifications n set status = 'sending', claimed_at = now()
     where n.id in (select id from public.notifications
                     where status = 'pending' and expires_at > now()
                     order by created_at
                     limit p_limit
                     for update skip locked)
    returning n.*;
end;
$$;

-- Every minute: start the sender, only when something is due. It calls the
-- send-push function with the cron key (D66); the key and the functions'
-- address live in Vault, set at release, never in this file.
create function public.send_due_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_url text;
begin
  if not exists (select 1 from public.notifications where status = 'pending' and expires_at > now()) then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'clarivi_cron_key';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'clarivi_functions_url';
  if v_key is null or v_url is null then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-clarivi-cron', v_key),
    body := '{"kind": "due"}'::jsonb,
    timeout_milliseconds := 30000);
end;
$$;

-- The card first showing a status saves what was shown (D61).
create function public.record_shown(p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.shown_status (user_id, date, via, status, nudge, reason_codes, readings_used, total, settings_version)
  select d.user_id, d.date, 'card', d.status, d.nudge, d.reason_codes, d.readings_used, d.total, d.settings_version
    from public.daily_status d
   where d.user_id = v_user and d.date = p_date and d.status <> 'none'
  on conflict (user_id, date, via) do nothing;
end;
$$;

-- Whether a day's follow-through can be answered now (R52, D67): its shown
-- nudge asked for a change, and it is between 8pm that day and noon the
-- next, in the person's local time. p_now is for tests.
create function public.followthrough_open(p_user uuid, p_date date, p_now timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.shown_change_nudge(p_user, p_date) is not null
     and coalesce(public.local_now(p_user, p_now) >= p_date + time '20:00'
                  and public.local_now(p_user, p_now) < p_date + 1 + time '12:00', false)
$$;

-- Saves a follow-through answer (R52 to R56): only for a day whose shown
-- nudge asked for a change, from 8pm that day until noon the next (D67).
create function public.submit_followthrough(p_date date, p_answer text, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_answer is null or p_answer not in ('yes', 'no') then
    raise exception 'unknown answer' using errcode = '22023';
  end if;
  if p_channel is null or p_channel not in ('push', 'card', 'next_morning') then
    raise exception 'unknown channel' using errcode = '22023';
  end if;
  if public.shown_change_nudge(v_user, p_date) is null then
    raise exception 'no change was asked for that day' using errcode = '22023';
  end if;
  if not public.followthrough_open(v_user, p_date) then
    raise exception 'outside the time to answer' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('followthrough:' || v_user::text));
  if (select count(*) from public.followthrough where user_id = v_user and date = p_date) >= 50 then
    raise exception 'too many answers' using errcode = '54000';
  end if;
  insert into public.followthrough (user_id, date, answer, channel) values (v_user, p_date, p_answer, p_channel);
end;
$$;

-- A tap on a notification opens the app with its id, which records the tap (R51).
create function public.log_notification_tap(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set tapped_at = coalesce(tapped_at, now())
   where id = p_id and user_id = (select auth.uid())
$$;

-- The analysis queue now queues the morning notification after a daily
-- post's work (only daily posts ask to notify; imports never do, R12).
create or replace function public.run_analysis_queue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_done integer := 0;
begin
  -- One run at a time.
  if not pg_try_advisory_xact_lock(hashtext('run_analysis_queue')) then
    return 0;
  end if;

  for v_user in
    select q.user_id, min(q.from_date) as from_date, max(q.to_date) as to_date, array_agg(q.id) as ids,
           bool_or(q.send_push) as send_push
      from public.analysis_queue q
     where q.status = 'pending'
       and not exists (
         select 1 from public.analysis_queue b
          where b.user_id = q.user_id and b.status = 'pending' and b.reason = 'backfill'
            and b.queued_at > now() - interval '2 minutes')
     group by q.user_id
  loop
    begin
      perform public.recompute(v_user.user_id, v_user.from_date, v_user.to_date);
      if v_user.send_push then
        perform public.queue_morning_notification(v_user.user_id);
      end if;
      update public.analysis_queue set status = 'done', done_at = now() where id = any (v_user.ids);
      v_done := v_done + 1;
    exception when others then
      -- Try again on the next runs; give up after 3 attempts.
      update public.analysis_queue
         set attempts = attempts + 1, error = left(sqlerrm, 300),
             status = case when attempts + 1 >= 3 then 'failed' else 'pending' end,
             done_at = case when attempts + 1 >= 3 then now() end
       where id = any (v_user.ids);
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.local_now(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.local_moment(uuid, date, time) from public, anon, authenticated;
revoke all on function public.shown_change_nudge(uuid, date) from public, anon, authenticated;
revoke all on function public.followthrough_open(uuid, date, timestamptz) from public, anon, authenticated;
revoke all on function public.queue_morning_notification(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.plan_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.claim_due_notifications(integer) from public, anon, authenticated;
revoke all on function public.send_due_notifications() from public, anon, authenticated;
revoke all on function public.record_shown(date) from public, anon;
revoke all on function public.submit_followthrough(date, text, text) from public, anon;
revoke all on function public.log_notification_tap(bigint) from public, anon;
grant execute on function public.queue_morning_notification(uuid, timestamptz) to service_role;
grant execute on function public.plan_notifications(timestamptz) to service_role;
grant execute on function public.claim_due_notifications(integer) to service_role;
grant execute on function public.record_shown(date) to authenticated;
grant execute on function public.submit_followthrough(date, text, text) to authenticated;
grant execute on function public.log_notification_tap(bigint) to authenticated;

select cron.schedule('plan-notifications', '*/5 * * * *', 'select public.plan_notifications()');
select cron.schedule('send-due-notifications', '* * * * *', 'select public.send_due_notifications()');
