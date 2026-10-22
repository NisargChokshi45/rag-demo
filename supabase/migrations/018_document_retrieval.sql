-- Document retrieval v2: region and chapter metadata, OR-style keyword search,
-- filter-safe vector search, and a cache for figure descriptions.

-- 1. Chapter and region on every chunk. Set from the document's own headings
--    at parse time; '' means the chunk sits outside any chapter or region.
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS chapter text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS document_chunks_region_idx
  ON document_chunks (document_id, region);

-- 2. Pages that carry charts (found at parse time), read by the vision pass.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS visual_pages int[] NOT NULL DEFAULT '{}';

-- Figure descriptions read by the vision model, one per page. Kept apart
--    from the chunks so a re-parse can rebuild chunks without another call.
CREATE TABLE IF NOT EXISTS document_figures (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page int NOT NULL,
  description text NOT NULL,
  model text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (document_id, page)
);

-- 3. Hybrid search. Parent sections ('section' rows) are read through their
--    children, so they are never searched. The keyword leg ORs the question's terms: websearch_to_tsquery
--    ANDs them, so a natural-language question rarely matched and the keyword
--    leg returned almost nothing. Ranking by ts_rank_cd still favours chunks that
--    match more of the terms.
--    The vector leg runs with an iterative scan so the document filter does not
--    starve the HNSW index (pgvector 0.8+). Older versions ignore the setting.
DROP FUNCTION IF EXISTS search_document_chunks(uuid, text, vector, int, int);

CREATE OR REPLACE FUNCTION search_document_chunks(
  p_document_id uuid,
  p_query_text text,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 20,
  p_rrf_k int DEFAULT 60,
  p_region text DEFAULT NULL,
  p_chapter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  parent_id uuid,
  chunk_index int,
  kind text,
  section_path text,
  chapter text,
  region text,
  page_start int,
  page_end int,
  content text,
  score float
) AS $$
DECLARE
  v_terms text;
  v_query tsquery;
BEGIN
  PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
  PERFORM set_config('hnsw.ef_search', '200', true);

  -- Terms are reduced to letters and digits, so the OR query cannot be malformed.
  SELECT string_agg(term, ' | ')
    INTO v_terms
  FROM (
    SELECT DISTINCT regexp_replace(lower(w), '[^a-z0-9]', '', 'g') AS term
    FROM regexp_split_to_table(coalesce(p_query_text, ''), '\s+') AS w
  ) t
  WHERE length(term) > 0;

  IF v_terms IS NOT NULL THEN
    v_query := to_tsquery('english', v_terms);
  END IF;

  RETURN QUERY
  WITH vector_ranked AS (
    SELECT
      c.id AS chunk_id,
      row_number() OVER (ORDER BY c.embedding <=> p_query_embedding) AS rank_position
    FROM document_chunks c
    WHERE c.document_id = p_document_id
      AND c.embedding IS NOT NULL
      AND c.kind <> 'section'
      AND (p_region IS NULL OR c.region = p_region)
      AND (p_chapter IS NULL OR c.chapter = p_chapter)
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT 50
  ),
  keyword_ranked AS (
    SELECT
      c.id AS chunk_id,
      row_number() OVER (ORDER BY ts_rank_cd(c.fts, v_query) DESC) AS rank_position
    FROM document_chunks c
    WHERE v_query IS NOT NULL
      AND c.document_id = p_document_id
      AND c.kind <> 'section'
      AND c.fts @@ v_query
      AND (p_region IS NULL OR c.region = p_region)
      AND (p_chapter IS NULL OR c.chapter = p_chapter)
    LIMIT 50
  ),
  fused AS (
    SELECT
      coalesce(v.chunk_id, k.chunk_id) AS chunk_id,
      coalesce(1.0 / (p_rrf_k + v.rank_position), 0)
        + coalesce(1.0 / (p_rrf_k + k.rank_position), 0) AS fused_score
    FROM vector_ranked v
    FULL OUTER JOIN keyword_ranked k ON v.chunk_id = k.chunk_id
  )
  SELECT
    dc.id,
    dc.parent_id,
    dc.chunk_index,
    dc.kind,
    dc.section_path,
    dc.chapter,
    dc.region,
    dc.page_start,
    dc.page_end,
    dc.content,
    f.fused_score::float
  FROM fused f
  JOIN document_chunks dc ON dc.id = f.chunk_id
  ORDER BY f.fused_score DESC
  LIMIT p_match_count;
END;
$$ LANGUAGE plpgsql;
