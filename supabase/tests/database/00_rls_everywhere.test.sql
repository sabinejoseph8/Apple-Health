-- Fails the build if any table in the public schema has row-level security
-- switched off (tech-spec section 5, pattern 1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  '{}'::text[],
  'every table in the public schema has row-level security switched on'
);

select * from finish();
rollback;
