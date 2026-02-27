-- Drop the overly permissive RLS policy that grants anon full access.
-- The service role bypasses RLS automatically, so no policy is needed.
DROP POLICY IF EXISTS "Service role full access on api_keys" ON public.api_keys;
