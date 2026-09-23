-- Add user_id to screenings table for multi-user support
alter table screenings
add column user_id uuid,
add column report jsonb,
add column reasoning text,
add column context text[];

-- Add foreign key for user_id (optional - auth may not be enabled)
-- User deletes won't cascade to preserve history
-- But we'll add index for fast user-specific queries
create index if not exists screenings_user_id_idx on screenings(user_id);

-- Create screening_citations table to store citations linked to assessments
create table if not exists screening_citations (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid references screenings(id) on delete cascade,
  assessment_id uuid references screening_assessments(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  candidate_name text not null,
  content text not null,
  tool text not null, -- 'search_chunks' or 'get_full_resume'
  created_at timestamptz default now()
);

create index if not exists screening_citations_screening_id_idx on screening_citations(screening_id);
create index if not exists screening_citations_assessment_id_idx on screening_citations(assessment_id);
