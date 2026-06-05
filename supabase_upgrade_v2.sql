-- WasherBox Brotherhood Season 6 — Safe Upgrade Script
-- Run this in your Supabase SQL Editor if you already have the v1 schema
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards)

-- Add new columns to matches table
alter table matches add column if not exists bracket_section text default 'winners';
alter table matches add column if not exists section_round_index int default 0;

-- Backfill existing rows so old matches are compatible
update matches set bracket_section = 'winners' where bracket_section is null;
update matches set section_round_index = round_index where section_round_index is null;

-- Add index for the new lookup pattern
create index if not exists matches_section_idx 
  on matches(bracket_section, section_round_index, match_index);
