-- ============================================================
-- QUANTEDGE — Options Snapshots Table Migration
-- Run this in Supabase SQL Editor if the table doesn't exist yet
-- ============================================================

create table if not exists options_snapshots (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null,
  stock_price numeric,
  expiry text,
  dte integer,
  snapshot_json jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_options_snapshots_symbol on options_snapshots(symbol);
create index if not exists idx_options_snapshots_recorded on options_snapshots(recorded_at desc);

-- RLS (same as other tables — single user, allow all)
alter table options_snapshots enable row level security;
create policy "Allow all" on options_snapshots for all using (true) with check (true);

-- Auto-cleanup: delete snapshots older than 30 days to stay within free tier
-- Run this as a scheduled SQL job in Supabase Dashboard → Database → Extensions → pg_cron
-- select cron.schedule('cleanup-old-snapshots', '0 3 * * *', $$
--   delete from options_snapshots where recorded_at < now() - interval '30 days';
-- $$);
