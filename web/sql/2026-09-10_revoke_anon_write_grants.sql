-- Defense in depth: the anon/authenticated roles still hold Supabase's default
-- INSERT/UPDATE/DELETE/TRUNCATE grants on the public tables. RLS blocks
-- INSERT/UPDATE/DELETE today because no such policies exist, but TRUNCATE is
-- not governed by RLS and a single future permissive policy would open writes.
-- The browser only ever reads submissions and uploads to storage.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.submissions, public.violations, public.comments, public.reports, public.report_replies
  FROM anon, authenticated;

-- Nothing in the browser reads these; the server uses the service role.
REVOKE SELECT ON public.violations, public.comments, public.report_replies FROM anon, authenticated;

-- Stats/maintenance functions are only ever called with the service role.
REVOKE EXECUTE ON FUNCTION public.mark_verified_violations(uuid) FROM PUBLIC, anon, authenticated;
