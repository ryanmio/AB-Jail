-- The "redacted" storage bucket is unused by the application but is flagged
-- public and has an anon read policy. A public bucket serves every object by
-- URL regardless of policies, so anything written there in future (the env
-- default SUPABASE_BUCKET_REDACTED still points at it) would be world-readable.
update storage.buckets set public = false where id = 'redacted';
drop policy if exists public_read_redacted on storage.objects;
