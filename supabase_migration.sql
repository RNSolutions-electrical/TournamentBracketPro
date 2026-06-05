-- WasherBox Brotherhood Season 6 Schema
-- Run this entire file in your Supabase SQL Editor (safe to re-run)

-- Players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  image_url text,
  color text default '#c8a84b',
  created_at timestamptz default now()
);

-- Tournament state (single row keyed by season)
create table if not exists tournament (
  id text primary key default 'season6',
  bracket jsonb,           -- full structure: { type, rounds[] | winners[]/losers[]/grandFinal, roundNames }
  status text default 'setup',  -- setup | active | complete
  updated_at timestamptz default now()
);

-- Matches
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  round_index int not null default 0,         -- legacy / display order
  match_index int not null default 0,          -- position within round
  bracket_section text default 'winners',      -- 'winners' | 'losers' | 'grand_final'
  section_round_index int default 0,           -- round index within its section
  player1_id uuid references players(id) on delete set null,
  player2_id uuid references players(id) on delete set null,
  rounds jsonb default '[]'::jsonb,            -- [{p1Box,p1Cup,p2Box,p2Cup,gross1,gross2,net1,net2,confirmed}]
  total_net1 int default 0,
  total_net2 int default 0,
  winner_id uuid references players(id) on delete set null,
  status text default 'pending',               -- pending | active | complete
  updated_at timestamptz default now()
);

-- Indexes for common queries
create index if not exists matches_section_idx on matches(bracket_section, section_round_index, match_index);
create index if not exists matches_round_idx on matches(round_index, match_index);

-- Enable Realtime
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table tournament;
alter publication supabase_realtime add table matches;

-- RLS: open read/write (PIN enforced in app layer)
alter table players enable row level security;
alter table tournament enable row level security;
alter table matches enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='players' and policyname='public read players') then
    create policy "public read players" on players for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='players' and policyname='public write players') then
    create policy "public write players" on players for all using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='tournament' and policyname='public read tournament') then
    create policy "public read tournament" on tournament for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='tournament' and policyname='public write tournament') then
    create policy "public write tournament" on tournament for all using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='matches' and policyname='public read matches') then
    create policy "public read matches" on matches for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='matches' and policyname='public write matches') then
    create policy "public write matches" on matches for all using (true);
  end if;
end $$;

-- If upgrading from previous version, add new columns safely
alter table matches add column if not exists bracket_section text default 'winners';
alter table matches add column if not exists section_round_index int default 0;
