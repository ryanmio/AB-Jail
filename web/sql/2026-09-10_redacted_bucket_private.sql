-- Make the redacted bucket private.
update storage.buckets set public = false where id = 'redacted';
drop policy if exists public_read_redacted on storage.objects;
