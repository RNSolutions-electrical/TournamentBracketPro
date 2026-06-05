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

-- v2.3 upgrade: add freeform_round_id for custom bracket support
alter table matches add column if not exists freeform_round_id text default null;
create index if not exists matches_freeform_idx on matches(bracket_section, freeform_round_id, match_index);

-- v2.7 upgrade: store builder match id on DB rows for reliable winner-link resolution
alter table matches add column if not exists freeform_match_id text default null;
create index if not exists matches_ffmatch_idx on matches(freeform_match_id);
