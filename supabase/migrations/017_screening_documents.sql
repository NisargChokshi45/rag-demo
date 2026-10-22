-- Screening sessions can target either a job's candidate pool or a document.
-- Existing rows default to 'job', so legacy sessions stay job screenings.

ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS screening_type text NOT NULL DEFAULT 'job';

ALTER TABLE screenings
  DROP CONSTRAINT IF EXISTS screenings_screening_type_check;
ALTER TABLE screenings
  ADD CONSTRAINT screenings_screening_type_check
  CHECK (screening_type IN ('job', 'document'));

-- A deleted document keeps its session (answers live in metadata.conversation)
-- but loses the link, so the UI can show "Document deleted".
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS document_id uuid
  REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS screenings_document_id_idx ON screenings(document_id);
