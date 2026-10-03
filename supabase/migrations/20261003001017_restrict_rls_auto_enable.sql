-- Supabase's automatic row-level security for new tables (rls_auto_enable,
-- chosen when the live project was created) runs as an event trigger. It
-- never needs to be called through the API, so nobody outside may call it.
-- The local copy doesn't have this function, so the change is skipped there.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
