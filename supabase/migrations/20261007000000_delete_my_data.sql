-- Phase 5: "Delete my data" (R59). Removes everything held for one person
-- from every table that has a user_id, except their profile (the account
-- stays). It finds the tables itself, so a table added later is covered
-- without changing this. Called only by the account-delete-data function,
-- after it has checked the password.
create function public.delete_my_data(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_rows integer;
  v_total integer := 0;
begin
  if p_user is null then
    raise exception 'no user' using errcode = '22023';
  end if;
  for v_table in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
       and c.table_name <> 'profiles'
     order by c.table_name
  loop
    execute format('delete from public.%I where user_id = $1', v_table) using p_user;
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  -- The account stays; its time zone comes back with the next sync.
  update public.profiles set latest_tz_offset_min = null where user_id = p_user;
  return v_total;
end;
$$;

revoke all on function public.delete_my_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_data(uuid) to service_role;
