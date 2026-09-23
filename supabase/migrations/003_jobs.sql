create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  experience text not null default '',
  skills text[] not null default '{}',
  created_at timestamptz default now()
);