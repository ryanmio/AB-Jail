-- Enable RLS on report_verdicts and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read this table directly.
ALTER TABLE public.report_verdicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_verdicts FROM anon;
REVOKE ALL ON public.report_verdicts FROM authenticated;
