-- Tighten anon/authenticated grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.submissions, public.violations, public.comments, public.reports, public.report_replies
  FROM anon, authenticated;

REVOKE SELECT ON public.violations, public.comments, public.report_replies FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_verified_violations(uuid) FROM PUBLIC, anon, authenticated;
