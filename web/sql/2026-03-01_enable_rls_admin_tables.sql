-- Enable RLS on all admin/internal tables and block anon/authenticated access.
-- The service role bypasses RLS automatically, so all server-side operations continue to work.
-- No permissive policies are created: anon and authenticated roles cannot read these tables directly.
-- This closes the gap where anyone with the public anon key could query these tables via the REST API.

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.audit_log FROM authenticated;

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deletion_requests FROM anon;
REVOKE ALL ON public.deletion_requests FROM authenticated;

ALTER TABLE public.evaluation_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_sessions FROM anon;
REVOKE ALL ON public.evaluation_sessions FROM authenticated;

-- Also resolves sensitive_columns_exposed warning for session_id.
ALTER TABLE public.evaluation_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_responses FROM anon;
REVOKE ALL ON public.evaluation_responses FROM authenticated;

ALTER TABLE public.report_verdicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_verdicts FROM anon;
REVOKE ALL ON public.report_verdicts FROM authenticated;

ALTER TABLE public.sender_violation_exemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sender_violation_exemptions FROM anon;
REVOKE ALL ON public.sender_violation_exemptions FROM authenticated;

ALTER TABLE public.platform_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_status FROM anon;
REVOKE ALL ON public.platform_status FROM authenticated;
