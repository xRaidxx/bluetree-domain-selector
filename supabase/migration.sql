-- BlueTree Domain Selector — run this once in Supabase SQL editor

-- 1. domains (vendor inventory imported from CSV)
create table if not exists domains (
  id uuid primary key default gen_random_uuid(),
  -- scored fields
  domain text,
  dr numeric,
  traffic numeric,
  niche text,
  main_niche text,
  complementary text,
  indirect text,
  gp_price numeric,
  li_price numeric,
  link_type text,
  tat text,
  red_flags text,
  ranking text,
  contact text,
  geo text,
  status text,
  -- stored but not scored
  ur numeric,
  traffic_value numeric,
  traffic_trend text,
  kw_trend text,
  ratio_analysis text,
  price_analysis text,
  link_no text,
  times_used integer,
  projects_used text,
  usage_saturation text,
  bt_inbox text,
  contact_type text,
  notes text,
  added_by text,
  date_added text,
  cm_hashes text,
  created_at timestamptz default now()
);

-- 2. scoring_config (editable scoring profiles — versioned)
create table if not exists scoring_config (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  profile_name text not null,
  niche_match_cap numeric not null default 40,
  dr_cap numeric not null default 15,
  traffic_cap numeric not null default 15,
  price_efficiency_cap numeric not null default 10,
  ranking_bonus_cap numeric not null default 10,
  geo_match_cap numeric not null default 5,
  no_red_flags_cap numeric not null default 5,
  min_dr numeric not null default 45,
  min_traffic numeric not null default 2000,
  default_follow text not null default 'dofollow',
  shortlist_size integer not null default 50,
  niche_prompt text,
  disqualifiers jsonb default '[]',
  is_active boolean not null default false,
  created_at timestamptz default now()
);

-- 3. campaigns
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_niche text,
  target_pages jsonb default '[]',
  budget_per_link numeric,
  geo text,
  follow_preference text default 'dofollow',
  min_dr numeric default 50,
  min_traffic numeric default 3000,
  link_count_goal integer,
  profile text default 'standard',
  shortlist_size integer default 50,
  results jsonb default '[]',
  excluded jsonb default '[]',
  scoring_config_id uuid references scoring_config(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3b. Client info columns (run this if upgrading an existing database)
alter table campaigns
  add column if not exists website text,
  add column if not exists primary_contact text,
  add column if not exists contact_email text,
  add column if not exists industry text,
  add column if not exists account_manager text,
  add column if not exists campaign_start_date date,
  add column if not exists contract_value numeric,
  add column if not exists billing_cycle text default 'monthly';

-- Seed: 4 scoring profiles (version 1, is_active = true)
insert into scoring_config
  (version, profile_name, niche_match_cap, dr_cap, traffic_cap, price_efficiency_cap,
   ranking_bonus_cap, geo_match_cap, no_red_flags_cap, min_dr, min_traffic, is_active)
values
  (1, 'standard',       40, 15, 15, 10, 10,  5,  5, 45, 2000, true),
  (1, 'ecommerce',      50, 10, 10, 10, 10,  5,  5, 45, 2000, true),
  (1, 'fintech',        35, 15, 15, 10, 10,  5, 10, 45, 2000, true),
  (1, 'local_services', 40, 15,  5, 10, 10, 15,  5, 45, 2000, true)
on conflict do nothing;
