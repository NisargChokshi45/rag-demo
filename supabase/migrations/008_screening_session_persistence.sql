alter table screenings
  add column if not exists status text not null default 'completed',
  add column if not exists response_text text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

create index if not exists screenings_status_idx on screenings(status);