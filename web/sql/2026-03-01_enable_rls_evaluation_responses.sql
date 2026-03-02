-- Enable RLS on evaluation_responses and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read this table directly.
-- This also resolves the sensitive_columns_exposed warning for session_id.
ALTER TABLE public.evaluation_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_responses FROM anon;
REVOKE ALL ON public.evaluation_responses FROM authenticated;
