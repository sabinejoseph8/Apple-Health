-- D98: consent text version 4. The AI paragraph now names what the weekly digest
-- also sends: how the person said they felt each day, and whether they followed
-- each day's suggestion. Nothing else changes (7b-7 code review, Sabine's choice).
-- Everyone agrees again once; until then uploads and AI texts wait, as for version 3.
create or replace function public.consent_version()
returns integer
language sql
stable
set search_path = ''
as $$ select 4 $$;
