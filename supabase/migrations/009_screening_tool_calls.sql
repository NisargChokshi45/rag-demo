alter table screenings
  add column if not exists tool_calls jsonb not null default '[]'::jsonb;
