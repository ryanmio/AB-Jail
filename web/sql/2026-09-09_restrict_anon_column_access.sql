-- Restrict what the public anon key can read straight from PostgREST.
--
-- RLS is row-level only. The public_read_submissions policy let anon read EVERY
-- column of every public=true row, including submission_token (fires the
-- one-time report), email_body_original (unredacted HTML that still contains
-- honeytrap addresses and tracking IDs), uploader_fingerprint and forwarder_email.
-- The browser only ever selects id, created_at, ai_version, sender_name and
-- filters on message_type/created_at (src/app/page.tsx), so grant exactly that.
REVOKE SELECT ON public.submissions FROM anon, authenticated;
GRANT SELECT (id, created_at, ai_version, sender_name, message_type, processing_status, public)
  ON public.submissions TO anon, authenticated;

-- Nothing in the browser reads reports, and the rows carry send_token
-- (bypasses the queued-report gate), html_body and cc_email.
REVOKE SELECT ON public.reports FROM anon, authenticated;

-- 2026-02-26_fix_api_keys_rls.sql revoked EXECUTE from anon/authenticated but
-- functions are granted to PUBLIC by default, which anon inherits.
REVOKE EXECUTE ON FUNCTION public.increment_api_key_usage(uuid) FROM PUBLIC;
