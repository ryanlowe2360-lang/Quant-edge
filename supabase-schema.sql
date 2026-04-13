-- ============================================================
-- QUANTEDGE — Supabase Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Watchlist ───────────────────────────────────────────────
create table if not exists watchlist (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null,
  quant_rank integer,
  quant_score numeric,
  date_added timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(symbol, active)
);

create index idx_watchlist_active on watchlist(active);

-- ── Signals ─────────────────────────────────────────────────
create table if not exists signals (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null,
  score integer not null,
  direction text not null check (direction in ('LONG', 'SHORT', 'NEUTRAL')),
  confidence text check (confidence in ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')),
  indicators_json jsonb,
  explanation text,
  contract_recommendation jsonb,
  created_at timestamptz not null default now()
);

create index idx_signals_symbol on signals(symbol);
create index idx_signals_created on signals(created_at desc);

-- ── User Trades ─────────────────────────────────────────────
create table if not exists trades_user (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null,
  direction text not null check (direction in ('LONG', 'SHORT')),
  strike numeric,
  expiry text,
  entry_price numeric not null,
  exit_price numeric,
  contracts integer not null default 1,
  entry_time timestamptz not null default now(),
  exit_time timestamptz,
  pnl numeric,
  pnl_pct numeric,
  grade text check (grade in ('A', 'B', 'C', 'D', 'F')),
  grade_explanation text,
  signal_id uuid references signals(id),
  created_at timestamptz not null default now()
);

create index idx_trades_user_symbol on trades_user(symbol);
create index idx_trades_user_entry on trades_user(entry_time desc);

-- ── System Trades ───────────────────────────────────────────
create table if not exists trades_system (
  id uuid primary key default uuid_generate_v4(),
  symbol text not null,
  direction text not null check (direction in ('LONG', 'SHORT')),
  strike numeric,
  expiry text,
  entry_price numeric not null,
  exit_price numeric,
  contracts integer not null default 1,
  entry_time timestamptz not null default now(),
  exit_time timestamptz,
  pnl numeric,
  pnl_pct numeric,
  signal_id uuid references signals(id),
  exit_reason text,
  created_at timestamptz not null default now()
);

create index idx_trades_system_symbol on trades_system(symbol);
create index idx_trades_system_entry on trades_system(entry_time desc);

-- ── Daily Reports ───────────────────────────────────────────
create table if not exists daily_reports (
  id uuid primary key default uuid_generate_v4(),
  date date not null unique,
  user_pnl numeric default 0,
  system_pnl numeric default 0,
  user_win_rate numeric default 0,
  system_win_rate numeric default 0,
  user_trades_count integer default 0,
  system_trades_count integer default 0,
  risk_compliance text,
  biggest_mistake text,
  education_tip text,
  report_json jsonb,
  created_at timestamptz not null default now()
);

-- ── Weekly Reports ──────────────────────────────────────────
create table if not exists weekly_reports (
  id uuid primary key default uuid_generate_v4(),
  week_start date not null,
  week_end date not null,
  report_json jsonb,
  created_at timestamptz not null default now()
);

-- ── Events Calendar ─────────────────────────────────────────
create table if not exists events_calendar (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null,
  symbol text,
  event_date date not null,
  event_time text,
  description text,
  created_at timestamptz not null default now()
);

create index idx_events_date on events_calendar(event_date);

-- ── Account State ───────────────────────────────────────────
create table if not exists account_state (
  id uuid primary key default uuid_generate_v4(),
  balance numeric not null default 500,
  updated_at timestamptz not null default now()
);

-- Insert default account state
insert into account_state (balance) values (500)
on conflict do nothing;

-- ── Settings ────────────────────────────────────────────────
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Insert default settings
insert into settings (key, value) values
  ('signal_threshold', '70'),
  ('max_risk_per_trade_pct', '30'),
  ('daily_loss_limit_pct', '10'),
  ('daily_trade_limit', '3'),
  ('experience_level', 'beginner'),
  ('preferred_trade_duration', 'mix'),
  ('sound_enabled', 'true'),
  ('mode', 'paper')
on conflict (key) do nothing;

-- ── Row Level Security (allow all for single-user app) ──────
-- Disable RLS for now since this is a personal tool
-- If you later add auth, enable RLS and add policies
alter table watchlist enable row level security;
alter table signals enable row level security;
alter table trades_user enable row level security;
alter table trades_system enable row level security;
alter table daily_reports enable row level security;
alter table weekly_reports enable row level security;
alter table events_calendar enable row level security;
alter table account_state enable row level security;
alter table settings enable row level security;

-- Allow all operations (single-user, no auth)
create policy "Allow all" on watchlist for all using (true) with check (true);
create policy "Allow all" on signals for all using (true) with check (true);
create policy "Allow all" on trades_user for all using (true) with check (true);
create policy "Allow all" on trades_system for all using (true) with check (true);
create policy "Allow all" on daily_reports for all using (true) with check (true);
create policy "Allow all" on weekly_reports for all using (true) with check (true);
create policy "Allow all" on events_calendar for all using (true) with check (true);
create policy "Allow all" on account_state for all using (true) with check (true);
create policy "Allow all" on settings for all using (true) with check (true);
