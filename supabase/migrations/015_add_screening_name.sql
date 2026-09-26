-- Add optional name column to screenings for custom session titles
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS name text;

-- Index for searching by name
CREATE INDEX IF NOT EXISTS screenings_name_idx ON screenings(name);
