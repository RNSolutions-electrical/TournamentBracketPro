-- WasherBox Brotherhood Season 6 Schema
-- Run this in your Supabase SQL Editor

-- Players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  image_url text,
  color text default '#c8a84b',
  created_at timestamptz default now()
);

-- Tournament state (single row, keyed by season)
create table if not exists tournament (
  id text primary key default 'season6',
  bracket jsonb,
  status text default 'setup', -- setup | active | complete
  updated_at timestamptz default now()
);

-- Matches
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  round_index int not null,
  match_index int not null,
  player1_id uuid references players(id),
  player2_id uuid references players(id),
  rounds jsonb default '[]'::jsonb,  -- array of {p1_box, p1_cup, p2_box, p2_cup, net1, net2, confirmed}
  total_net1 int default 0,
  total_net2 int default 0,
  winner_id uuid references players(id),
  status text default 'pending', -- pending | active | complete
  updated_at timestamptz default now()
);

-- Enable Realtime on all tables
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table tournament;
alter publication supabase_realtime add table matches;

-- RLS: open read, open write (PIN enforced in app layer)
alter table players enable row level security;
alter table tournament enable row level security;
alter table matches enable row level security;

create policy "public read players" on players for select using (true);
create policy "public write players" on players for all using (true);

create policy "public read tournament" on tournament for select using (true);
create policy "public write tournament" on tournament for all using (true);

create policy "public read matches" on matches for select using (true);
create policy "public write matches" on matches for all using (true);
