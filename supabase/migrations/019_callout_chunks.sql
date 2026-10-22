-- Stat callouts and pull quotes in element_rich documents are stored as their
-- own chunks. Adds 'callout' to the kinds allowed on document_chunks.
ALTER TABLE document_chunks
  DROP CONSTRAINT IF EXISTS document_chunks_kind_check;

ALTER TABLE document_chunks
  ADD CONSTRAINT document_chunks_kind_check
  CHECK (kind IN ('section', 'text', 'table', 'footnote', 'figure', 'callout'));
