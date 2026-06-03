-- In Supabase: SQL Editor -> dieses Skript ausfuehren.
create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  person_name text,
  company_name text,
  transcript text,
  result text,
  model text
);
