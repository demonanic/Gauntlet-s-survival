-- Hardening (Nov 2026): the saves table kept Supabase's default grants, which
-- give the API roles every table privilege. Row-level security already limits
-- each player to their own row, but it doesn't cover TRUNCATE, and signed-out
-- visitors never need the table. The game only reads and upserts its own row
-- signed in (cloud/cloudSave.js), so nothing it does changes.
revoke all on table public.saves from anon;
revoke truncate, references, trigger on table public.saves from authenticated;
