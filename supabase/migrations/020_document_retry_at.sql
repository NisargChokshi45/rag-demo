-- When embedding stops on Gemini's quota, the earliest time it can resume is
-- stored here so the Documents page can count down to it.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS retry_at timestamptz;
