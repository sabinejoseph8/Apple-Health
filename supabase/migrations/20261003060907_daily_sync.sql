-- Phase 1b: daily sync (docs/tech-spec.md, sections 3 to 6).
--
-- The iPhone Shortcut posts readings with an upload token. The ingest server
-- function checks the body, then calls ingest_upload(), which finds the user
-- from the token's hash, stores each reading once and works out the reply
-- flags. Tokens can write but never read: nothing returns stored readings to
-- a token. Signed-in users can read only their own rows, and nobody writes to
-- these tables directly.

-- Upload tokens. Only a SHA-256 hash of each token is kept. A user has at most
-- one working token; reissuing revokes the old one in the same step.
create table public.upload_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index upload_tokens_one_working_idx
  on public.upload_tokens (user_id) where revoked_at is null;

alter table public.upload_tokens enable row level security;

create policy "upload_tokens: read own"
  on public.upload_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

-- The app may show when the token was made and last used, but never its hash.
revoke all on public.upload_tokens from anon, authenticated;
grant select (id, user_id, created_at, last_used_at, revoked_at) on public.upload_tokens to authenticated;

-- Uploads: one row per post, including rejected posts from a known token, so
-- a replaced token or a broken Shortcut shows up in the log.
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_id uuid references public.upload_tokens (id) on delete set null,
  received_at timestamptz not null default now(),
  schema_version integer,
  kind text check (kind in ('daily', 'backfill', 'ping')),
  month_id text check (month_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- Which automation ran the Shortcut, to measure locked-phone failures.
  run_trigger text check (run_trigger in ('charger', 'app', 'manual')),
  device_tz_offset_min integer check (device_tz_offset_min between -720 and 840),
  -- The phone's local date when the post arrived.
  local_date date,
  -- Readings in the post, and how many of them were already stored.
  sample_count integer not null default 0,
  duplicate_count integer not null default 0,
  -- True when last night was complete once this post was stored.
  night_complete boolean not null default false,
  status text not null check (status in ('accepted', 'rejected')),
  error text,
  check (status = 'rejected'
         or (schema_version is not null and kind is not null
             and device_tz_offset_min is not null and local_date is not null))
);

create index uploads_token_received_idx on public.uploads (token_id, received_at);
create index uploads_user_date_idx on public.uploads (user_id, local_date);

alter table public.uploads enable row level security;

create policy "uploads: read own"
  on public.uploads for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.uploads from anon, authenticated;
grant select on public.uploads to authenticated;

-- Samples: every reading, never changed after arrival. sample_hash is unique
-- per user, so posting the same reading again stores nothing new.
create table public.samples (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  upload_id uuid not null references public.uploads (id) on delete cascade,
  type text not null check (type in ('heart_rate', 'hrv_sdnn', 'sleep_stage', 'resting_hr', 'respiratory_rate')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  tz_offset_min integer not null check (tz_offset_min between -720 and 840),
  value double precision,
  unit text,
  stage text check (stage in ('in_bed', 'asleep', 'awake', 'core', 'deep', 'rem')),
  source_name text,
  source_device text,
  sample_hash bytea not null,
  check (end_at >= start_at),
  check ((type = 'sleep_stage') = (stage is not null)),
  check (type = 'sleep_stage' or value is not null),
  unique (user_id, sample_hash)
);

create index samples_user_type_end_idx on public.samples (user_id, type, end_at);

alter table public.samples enable row level security;

create policy "samples: read own"
  on public.samples for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.samples from anon, authenticated;
grant select on public.samples to authenticated;

-- Creates a new upload token for a user and revokes the old one in one step,
-- so an old token stops working at once (R11). Called only by the
-- account-token server function, which works out the user from the session
-- and has already checked the password.
create function public.issue_upload_token(p_user uuid, p_token_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created timestamptz;
begin
  update public.upload_tokens
     set revoked_at = now()
   where user_id = p_user and revoked_at is null;

  insert into public.upload_tokens (user_id, token_hash)
  values (p_user, p_token_hash)
  returning created_at into v_created;

  return v_created;
end;
$$;

revoke all on function public.issue_upload_token(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_upload_token(uuid, text) to service_role;

-- Stores one post from the Shortcut. Called only by the ingest server
-- function, with the SHA-256 hash of the upload token and a body it has
-- already checked against the schema (or the reason it rejected the body).
-- The user always comes from the token, never from the body.
--
-- The reply holds counts and flags only, never readings:
--   accepted                new readings stored
--   duplicates              readings that were already stored
--   night_complete          last night's sleep has arrived and its last
--                           asleep reading ended at least 10 minutes ago
--                           (starting rule for Phase 1b; Phase 2 builds the
--                           full rule)
--   already_complete_today  an earlier post today had already completed the
--                           night, so the Shortcut can stop after its ping
-- or {error} with invalid_token, token_revoked, rate_limited or invalid_body.
create function public.ingest_upload(p_token_hash text, p_upload jsonb, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.upload_tokens%rowtype;
  v_offset integer;
  v_local_date date;
  v_midnight timestamptz;
  v_upload_id uuid;
  v_submitted integer;
  v_inserted integer;
  v_already boolean;
  v_complete boolean := false;
  v_last_asleep timestamptz;
begin
  select * into v_token from public.upload_tokens where token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  -- 60 posts an hour per token (tech-spec section 6), counting rejected ones.
  if (select count(*) from public.uploads
       where token_id = v_token.id and received_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  if v_token.revoked_at is not null then
    insert into public.uploads (user_id, token_id, status, error)
    values (v_token.user_id, v_token.id, 'rejected', 'token_revoked');
    return jsonb_build_object('error', 'token_revoked');
  end if;

  if p_error is not null then
    insert into public.uploads (user_id, token_id, status, error)
    values (v_token.user_id, v_token.id, 'rejected', left(p_error, 200));
    return jsonb_build_object('error', 'invalid_body');
  end if;

  v_offset := (p_upload ->> 'device_tz_offset_min')::integer;
  v_local_date := ((now() at time zone 'utc') + make_interval(mins => v_offset))::date;
  v_submitted := jsonb_array_length(coalesce(p_upload -> 'samples', '[]'::jsonb));

  select exists (
    select 1 from public.uploads
     where user_id = v_token.user_id and local_date = v_local_date
       and status = 'accepted' and night_complete
  ) into v_already;

  insert into public.uploads (user_id, token_id, schema_version, kind, month_id, run_trigger,
                              device_tz_offset_min, local_date, status)
  values (v_token.user_id, v_token.id, (p_upload ->> 'schema_version')::integer, p_upload ->> 'kind',
          p_upload ->> 'month_id', p_upload ->> 'trigger', v_offset, v_local_date, 'accepted')
  returning id into v_upload_id;

  -- A reading is the same reading if its type, times, value, stage and source
  -- match. The time zone isn't part of it: the same moment posted from
  -- another time zone is still the same reading.
  insert into public.samples (user_id, upload_id, type, start_at, end_at, tz_offset_min, value, unit,
                              stage, source_name, source_device, sample_hash)
  select v_token.user_id, v_upload_id, s.type, s.start_at, s.end_at, s.tz_offset_min, s.value, s.unit,
         s.stage, s.source_name, s.source_device,
         sha256(convert_to(jsonb_build_array(s.type, extract(epoch from s.start_at), extract(epoch from s.end_at),
                                             s.value, s.stage, s.source_name)::text, 'UTF8'))
    from jsonb_to_recordset(coalesce(p_upload -> 'samples', '[]'::jsonb)) as s (
      type text, start_at timestamptz, end_at timestamptz, tz_offset_min integer, value double precision,
      unit text, stage text, source_name text, source_device text)
  on conflict (user_id, sample_hash) do nothing;
  get diagnostics v_inserted = row_count;

  -- Only a daily post can complete a night. An import never counts as
  -- today's sync, and a ping carries no readings.
  if p_upload ->> 'kind' = 'daily' then
    v_midnight := (v_local_date::timestamp - make_interval(mins => v_offset)) at time zone 'utc';
    select max(end_at) into v_last_asleep
      from public.samples
     where user_id = v_token.user_id
       and type = 'sleep_stage'
       and stage in ('asleep', 'core', 'deep', 'rem')
       and end_at >= v_midnight
       and end_at < v_midnight + interval '12 hours';
    v_complete := v_last_asleep is not null and v_last_asleep <= now() - interval '10 minutes';
  end if;

  update public.uploads
     set sample_count = v_submitted,
         duplicate_count = v_submitted - v_inserted,
         night_complete = v_complete
   where id = v_upload_id;

  update public.upload_tokens set last_used_at = now() where id = v_token.id;
  update public.profiles set latest_tz_offset_min = v_offset where user_id = v_token.user_id;

  return jsonb_build_object(
    'accepted', v_inserted,
    'duplicates', v_submitted - v_inserted,
    'night_complete', v_complete,
    'already_complete_today', v_already
  );
end;
$$;

revoke all on function public.ingest_upload(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.ingest_upload(text, jsonb, text) to service_role;
