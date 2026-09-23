-- Screenings table: one entry per job screening session
create table if not exists screenings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  query text not null,
  summary text,
  created_at timestamptz default now()
);

-- Screening assessments: candidate evaluations within a screening
create table if not exists screening_assessments (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid references screenings(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  score int,
  evidence text[],
  unknowns text[],
  created_at timestamptz default now()
);

-- Indexes for fast lookups
create index if not exists screenings_job_id_idx on screenings(job_id);
create index if not exists screenings_created_at_idx on screenings(created_at);
create index if not exists screening_assessments_screening_id_idx on screening_assessments(screening_id);
create index if not exists screening_assessments_candidate_id_idx on screening_assessments(candidate_id);
