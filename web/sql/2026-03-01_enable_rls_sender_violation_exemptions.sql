-- Enable RLS on sender_violation_exemptions and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read this table directly.
ALTER TABLE public.sender_violation_exemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sender_violation_exemptions FROM anon;
REVOKE ALL ON public.sender_violation_exemptions FROM authenticated;
