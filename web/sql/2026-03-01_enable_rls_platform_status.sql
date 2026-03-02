-- Enable RLS on platform_status and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read this table directly.
ALTER TABLE public.platform_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_status FROM anon;
REVOKE ALL ON public.platform_status FROM authenticated;
