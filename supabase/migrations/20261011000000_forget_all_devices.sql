-- Phase 5 manual check 3: "Sign out everywhere" (R7) also stops
-- notifications to every one of the person's devices, so a lost or shared
-- phone that is signed out never shows their status on its lock screen
-- (tech-spec section 3, push_subscriptions). A device that signs in again
-- registers afresh (register_push clears revoked_at).
create function public.forget_all_devices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.push_subscriptions set revoked_at = now()
   where user_id = v_user and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.forget_all_devices() from public, anon;
grant execute on function public.forget_all_devices() to authenticated;
