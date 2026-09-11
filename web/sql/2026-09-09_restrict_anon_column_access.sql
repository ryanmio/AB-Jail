-- Column-level grants for the anon role.
REVOKE SELECT ON public.submissions FROM anon, authenticated;
GRANT SELECT (id, created_at, ai_version, sender_name, message_type, processing_status, public)
  ON public.submissions TO anon, authenticated;

REVOKE SELECT ON public.reports FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_api_key_usage(uuid) FROM PUBLIC;
