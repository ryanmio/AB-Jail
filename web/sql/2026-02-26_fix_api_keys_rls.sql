-- Drop the overly permissive RLS policy that grants anon full access.
-- The service role bypasses RLS automatically, so no policy is needed.
DROP POLICY IF EXISTS "Service role full access on api_keys" ON public.api_keys;

-- Revoke default table-level grants from anon/authenticated roles.
-- Supabase's default privileges grant access to new public tables automatically.
REVOKE ALL ON public.api_keys FROM anon;
REVOKE ALL ON public.api_keys FROM authenticated;

-- Prevent anonymous callers from invoking the usage-tracking function directly.
REVOKE EXECUTE ON FUNCTION public.increment_api_key_usage(uuid) FROM anon, authenticated;
