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
  storage_path text not null,
  original_filename text not null,
  full_text text not null,
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

-- RPC function for vector search with similarity scoring
create or replace function match_resume_chunks(
  query_embedding vector,
  match_count int default 10
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
  order by resume_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$ language plpgsql;
