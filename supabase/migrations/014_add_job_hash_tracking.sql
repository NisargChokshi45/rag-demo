-- Track job state when candidate was scored to detect job changes
ALTER TABLE candidates ADD COLUMN job_hash text;

-- Index for checking if rescoring is needed
CREATE INDEX IF NOT EXISTS candidates_job_hash_idx ON candidates(id, job_hash);
