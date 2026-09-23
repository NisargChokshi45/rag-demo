-- Gemini Embedding 2 uses 1536-dimensional vectors in this application.
-- Existing vectors cannot be compared with the new embedding space, so they
-- must be discarded and rebuilt through the normal upload/ingest flow.
truncate table resume_chunks;

alter table resume_chunks drop column if exists embedding;
alter table resume_chunks add column embedding vector(1536) not null;

create index if not exists resume_chunks_embedding_idx
  on resume_chunks using hnsw (embedding vector_cosine_ops);