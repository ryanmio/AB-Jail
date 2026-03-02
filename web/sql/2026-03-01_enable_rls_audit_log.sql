-- Enable RLS on audit_log and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read this table directly.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.audit_log FROM authenticated;
