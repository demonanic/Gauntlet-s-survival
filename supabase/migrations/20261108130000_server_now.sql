-- Story mode (Nov 2026): the countdown runs on the server's clock, so changing
-- the phone's time can't stretch it. Signed-in players read it once in a
-- while (cloud/cloudSave.js serverClockOffset). Nothing else is exposed.
create or replace function public.server_now()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

revoke all on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
