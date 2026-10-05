-- Phase 6: the live project's privacy settings, read from the database's own
-- catalog (no rows of any table are read). Run read-only against the live
-- project, for example through the Supabase dashboard's SQL editor.
-- Expected: every table has row-level security and at least one policy;
-- signed-out visitors (anon) can read, write and run nothing; signed-in
-- people can't write any table directly; every function that runs with its
-- owner's rights has a fixed search path.

-- Tables and views in the public schema.
select c.relname as name,
       case c.relkind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view' else 'other' end as kind,
       c.relrowsecurity as row_level_security,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       has_table_privilege('anon', c.oid, 'select') as anon_read,
       has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update')
         or has_table_privilege('anon', c.oid, 'delete') as anon_write,
       has_table_privilege('authenticated', c.oid, 'select') as user_read,
       has_table_privilege('authenticated', c.oid, 'insert') as user_insert,
       has_table_privilege('authenticated', c.oid, 'update') as user_update,
       has_table_privilege('authenticated', c.oid, 'delete') as user_delete
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
 order by kind, name;

-- Functions in the public schema (trigger functions can't be called directly).
select p.proname as name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prorettype = 'trigger'::regtype as trigger_only,
       p.prosecdef as runs_as_owner,
       coalesce(array_to_string(p.proconfig, ','), '') like '%search_path%' as fixed_search_path,
       has_function_privilege('anon', p.oid, 'execute') as anon_run,
       has_function_privilege('authenticated', p.oid, 'execute') as user_run
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by name;

-- File storage: no bucket may be public.
select id, public from storage.buckets order by id;
