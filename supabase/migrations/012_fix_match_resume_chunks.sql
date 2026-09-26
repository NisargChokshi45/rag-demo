-- Fix match_resume_chunks to support job-scoped vector search with filter_job_id parameter
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
