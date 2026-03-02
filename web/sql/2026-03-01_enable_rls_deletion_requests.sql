-- Enable RLS on deletion_requests and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read this table directly.
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deletion_requests FROM anon;
REVOKE ALL ON public.deletion_requests FROM authenticated;
