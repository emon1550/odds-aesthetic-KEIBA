-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Races Table
-- Stores race information for the day
create table races (
  id uuid primary key default uuid_generate_v4(),
  race_date date not null,
  location text not null, -- e.g., "Tokyo", "Kyoto"
  race_number integer not null,
  race_name text,
  start_time timestamp with time zone not null,
  status text check (status in ('scheduled', 'finished', 'canceled')) default 'scheduled',
  external_id text unique, -- unique identifier from the source (e.g., date + loc + race_no)
  created_at timestamp with time zone default now()
);

-- 2. Odds Analysis Table (The Alerts)
-- Stores high-drop detection events
create table odds_analysis (
  id uuid primary key default uuid_generate_v4(),
  race_id uuid references races(id) on delete cascade,
  horse_number integer not null,
  horse_name text not null,
  previous_odds numeric(10, 2), -- The odds from the previous check
  current_odds numeric(10, 2) not null,
  drop_rate numeric(5, 4) not null, -- e.g., 0.20 for 20%
  detected_at timestamp with time zone default now()
);

-- 3. Odds Snapshots Table (Internal Use)
-- Stores the history of odds checks to calculate the drop rate against
create table odds_snapshots (
  id uuid primary key default uuid_generate_v4(),
  race_id uuid references races(id) on delete cascade,
  horse_number integer not null,
  odds numeric(10, 2) not null,
  fetched_at timestamp with time zone default now()
);

-- Indexing for performance
create index idx_races_date on races(race_date);
create index idx_snapshots_lookup on odds_snapshots(race_id, horse_number, fetched_at desc);
