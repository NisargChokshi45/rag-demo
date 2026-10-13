-- Documents feature: long-form PDFs (reports, sections, tables, footnotes)
-- parsed into typed chunks, embedded, and searched with hybrid retrieval.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  strategy text not null
    check (strategy in ('narrative', 'long_structured', 'element_rich')),
  page_count int not null default 0,
  status text not null default 'processing'
    check (status in ('processing', 'embedding', 'ready', 'failed')),
  error text,
  user_id uuid,
  created_at timestamptz default now()
);

create index if not exists documents_user_id_idx on documents(user_id);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  parent_id uuid references document_chunks(id) on delete cascade,
  chunk_index int not null,
  kind text not null check (kind in ('section', 'text', 'table', 'footnote', 'figure')),
  section_path text not null default '',
  page_start int not null,
  page_end int not null,
  content text not null,
  embedding vector(1536),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(section_path, '') || ' ' || content)
  ) stored,
  created_at timestamptz default now(),
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists document_chunks_fts_idx
  on document_chunks using gin (fts);
create index if not exists document_chunks_document_idx
  on document_chunks (document_id, chunk_index);

-- Rows still waiting for an embedding, in reading order. Used by the
-- resumable embedding loop so large documents never exceed one request.
create index if not exists document_chunks_pending_idx
  on document_chunks (document_id, chunk_index)
  where embedding is null;

-- Hybrid search: dense (HNSW cosine) and keyword (FTS) rankings fused with
-- reciprocal rank fusion. Keyword matching keeps exact numbers, units and
-- table names reachable when the embedding alone would miss them.
create or replace function search_document_chunks(
  p_document_id uuid,
  p_query_text text,
  p_query_embedding vector(1536),
  p_match_count int default 20,
  p_rrf_k int default 60
)
returns table (
  id uuid,
  parent_id uuid,
  chunk_index int,
  kind text,
  section_path text,
  page_start int,
  page_end int,
  content text,
  score float
) as $$
begin
  return query
  with vector_ranked as (
    select
      c.id as chunk_id,
      row_number() over (order by c.embedding <=> p_query_embedding) as rank_position
    from document_chunks c
    where c.document_id = p_document_id
      and c.embedding is not null
    order by c.embedding <=> p_query_embedding
    limit 50
  ),
  keyword_ranked as (
    select
      c.id as chunk_id,
      row_number() over (
        order by ts_rank_cd(c.fts, websearch_to_tsquery('english', p_query_text)) desc
      ) as rank_position
    from document_chunks c
    where c.document_id = p_document_id
      and c.fts @@ websearch_to_tsquery('english', p_query_text)
    limit 50
  ),
  fused as (
    select
      coalesce(v.chunk_id, k.chunk_id) as chunk_id,
      coalesce(1.0 / (p_rrf_k + v.rank_position), 0)
        + coalesce(1.0 / (p_rrf_k + k.rank_position), 0) as fused_score
    from vector_ranked v
    full outer join keyword_ranked k on v.chunk_id = k.chunk_id
  )
  select
    dc.id,
    dc.parent_id,
    dc.chunk_index,
    dc.kind,
    dc.section_path,
    dc.page_start,
    dc.page_end,
    dc.content,
    f.fused_score::float
  from fused f
  join document_chunks dc on dc.id = f.chunk_id
  order by f.fused_score desc
  limit p_match_count;
end;
$$ language plpgsql;

-- Storage bucket for uploaded documents (private; the service role writes).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
