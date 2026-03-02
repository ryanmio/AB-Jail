-- Enable RLS on evaluation_sessions and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read this table directly.
ALTER TABLE public.evaluation_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_sessions FROM anon;
REVOKE ALL ON public.evaluation_sessions FROM authenticated;
