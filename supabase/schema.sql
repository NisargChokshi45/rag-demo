-- Enable vector extension
create extension if not exists vector;

-- Jobs used as screening criteria
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  experience text not null default '',
  skills text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Candidates table
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  role_guess text,
  job_id uuid references jobs(id) on delete set null,
  storage_path text not null,
  original_filename text not null,
  full_text text not null,
  score int default null,
  created_at timestamptz default now()
);

-- Resume chunks table with embeddings
create table if not exists resume_chunks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Index for vector search on embeddings
create index if not exists resume_chunks_embedding_idx on resume_chunks using hnsw (embedding vector_cosine_ops);

-- Index for candidate lookups
create index if not exists resume_chunks_candidate_id_idx on resume_chunks(candidate_id);

-- Screenings table: one entry per job screening session
create table if not exists screenings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  query text not null,
  summary text,
  report jsonb,
  reasoning text,
  context text[],
  status text not null default 'completed',
  response_text text,
  metadata jsonb not null default '{}'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  feedback text check (feedback in ('like', 'dislike')),
  completed_at timestamptz,
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

-- Resume excerpts supporting an assessment
create table if not exists screening_citations (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid references screenings(id) on delete cascade,
  assessment_id uuid references screening_assessments(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  candidate_name text not null,
  content text not null,
  tool text not null,
  created_at timestamptz default now()
);

create index if not exists screening_citations_screening_id_idx on screening_citations(screening_id);
create index if not exists screening_citations_assessment_id_idx on screening_citations(assessment_id);

-- RPC function for vector search with similarity scoring
create or replace function match_resume_chunks(
  query_embedding vector,
  match_count int default 10,
  filter_job_id uuid default null
)
returns table (
  id uuid,
  candidate_id uuid,
  chunk_index int,
  content text,
  embedding vector,
  similarity float
) as $$
begin
  return query
  select
    resume_chunks.id,
    resume_chunks.candidate_id,
    resume_chunks.chunk_index,
    resume_chunks.content,
    resume_chunks.embedding,
    (1 - (resume_chunks.embedding <=> query_embedding)) as similarity
  from resume_chunks
  inner join candidates on resume_chunks.candidate_id = candidates.id
  where filter_job_id is null or candidates.job_id = filter_job_id
  order by resume_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$ language plpgsql;
