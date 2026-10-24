-- Applied to the "gauntlet" Supabase project (xtgpznknlaihmfohdmqs) on 2026-10-24.
-- One cloud save per player. Rows are only visible to their owner.
create table public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint saves_data_size check (pg_column_size(data) < 524288)
);

alter table public.saves enable row level security;

create policy "Players read their own save" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players create their own save" on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Players update their own save" on public.saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Players delete their own save" on public.saves
  for delete to authenticated using ((select auth.uid()) = user_id);
