-- Add a computed column for efficient sorting
-- Uses email_sent_at if available, otherwise falls back to created_at
ALTER TABLE submissions 
ADD COLUMN sort_date timestamptz 
GENERATED ALWAYS AS (COALESCE(email_sent_at, created_at)) STORED;

-- Create an index on the computed column for efficient sorting
CREATE INDEX IF NOT EXISTS submissions_sort_date_idx ON submissions(sort_date DESC);
