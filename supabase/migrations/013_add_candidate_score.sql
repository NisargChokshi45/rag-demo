-- Add score field to candidates table
-- Score represents job match as a percentage (0-100)
alter table candidates add column score int default null;

-- Add comment for clarity
comment on column candidates.score is 'Job match score (0-100) calculated during resume ingestion based on job description, experience, and skills';

-- Create index for scoring queries
create index if not exists candidates_score_idx on candidates(score desc);
