alter table candidates
  add column if not exists job_id uuid references jobs(id) on delete set null;

create index if not exists candidates_job_id_idx on candidates(job_id);