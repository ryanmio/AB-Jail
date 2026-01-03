-- Add email_sent_at column to store the original email send date
-- For forwarded emails, this captures when the original email was sent,
-- not when it was forwarded to our system (which is stored in created_at)

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Add index for efficient queries filtering by original email date
CREATE INDEX IF NOT EXISTS submissions_email_sent_at_idx ON submissions(email_sent_at);
