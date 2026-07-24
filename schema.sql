-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New query)

create table if not exists advertisers (
  id text primary key,                -- Google advertiser ID, e.g. AR02377450198621224961
  name text,
  region text,
  platform text default 'PLAY',
  total_creatives int,
  last_synced_at timestamptz
);

create table if not exists creatives (
  id text primary key,                -- creative ID from transparency center
  advertiser_id text references advertisers(id),
  format text,                        -- image | video | text | unknown
  content_js_url text,                -- Google's JSONP preview renderer URL
  preview_url text,                   -- resolved real asset/thumbnail URL
  asset_urls jsonb default '[]',      -- resolved media URLs (images, YouTube links)
  app_name text,                      -- promoted app title (from content.js preview)
  app_package text,                   -- promoted app package id, e.g. com.foo.bar
  app_url text,                       -- Play Store link for the promoted app
  countries jsonb default '[]',       -- running-campaign countries [{code,cc,name,first,last}]
  variation_count int,                -- number of video variations in this creative
  video_key text,                     -- de-dup key for the same underlying video
  detail_synced_at timestamptz,       -- when country/variation detail was last fetched
  first_shown date,
  last_shown date,
  days_shown int,
  raw jsonb,                          -- full raw payload, never lose data
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- If the creatives table already existed, add the promoted-app columns:
alter table creatives add column if not exists app_name text;
alter table creatives add column if not exists app_package text;
alter table creatives add column if not exists app_url text;
-- Phase 2: unique-video grouping + running-campaign country data:
alter table creatives add column if not exists countries jsonb default '[]';
alter table creatives add column if not exists variation_count int;
alter table creatives add column if not exists video_key text;
alter table creatives add column if not exists detail_synced_at timestamptz;

create index if not exists creatives_advertiser_idx
  on creatives (advertiser_id, id);
create index if not exists creatives_format_idx
  on creatives (advertiser_id, format);
create index if not exists creatives_video_idx
  on creatives (advertiser_id, video_key);

-- Phase 3: promoted-app catalog resolved from Google Play (keyed by package):
create table if not exists apps (
  package text primary key,            -- bundle id, e.g. com.zipx.compressor.rar.unarchiver
  title text,                          -- official Play Store title
  icon_url text,                       -- app icon (play-lh...)
  developer text,                      -- developer/author name
  rating numeric,                      -- aggregate rating value
  rating_count bigint,                 -- number of ratings
  genre text,                          -- applicationCategory
  play_resolved_at timestamptz,        -- when Play metadata was last fetched
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table apps enable row level security;

create table if not exists sync_jobs (
  id bigint generated always as identity primary key,
  advertiser_id text not null,
  status text default 'running',      -- running | done | failed
  pages_fetched int default 0,
  creatives_fetched int default 0,
  next_cursor text,                   -- resume point if interrupted
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- This tool talks to Supabase with the service_role key from a local server,
-- so RLS can stay enabled with no public policies (nothing exposed to browsers).
alter table advertisers enable row level security;
alter table creatives enable row level security;
alter table sync_jobs enable row level security;
