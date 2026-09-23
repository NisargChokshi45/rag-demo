create extension if not exists vector;

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  role_guess text,
  storage_path text not null,
  original_filename text not null,
  full_text text not null,
  created_at timestamptz default now()
);

create table if not exists resume_chunks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector,
  created_at timestamptz default now()
);

create index if not exists resume_chunks_candidate_id_idx
  on resume_chunks(candidate_id);

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