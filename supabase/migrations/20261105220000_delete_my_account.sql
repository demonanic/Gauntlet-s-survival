-- Applied to the "gauntlet" Supabase project (xtgpznknlaihmfohdmqs) on 2026-11-05.
-- The security advisor flags it (signed-in users can run a SECURITY DEFINER
-- function); that is the point, and it only deletes the caller's own account.
-- Lets a signed-in player delete their own account from the game (Cloud save →
-- Delete account). Runs as the function owner so it can remove the auth.users
-- row; it only ever touches the caller's own row (auth.uid()). Their save goes
-- with it (public.saves cascades on delete).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
