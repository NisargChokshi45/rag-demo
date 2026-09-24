alter table screenings
  add column if not exists feedback text
  check (feedback in ('like', 'dislike'));