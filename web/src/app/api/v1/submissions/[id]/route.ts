import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import { singleResponse, apiError, resolveImageUrl } from "@/lib/api-utils";

const SELECTED_FIELDS = [
  "id",
  "created_at",
  "email_sent_at",
  "sort_date",
  "sender_id",
  "sender_name",
  "message_type",
  "raw_text",
  "ai_summary",
  "email_subject",
  "email_body",
  "links",
  "media_urls",
  "is_fundraising",
  "landing_url",
  "image_url",
  "landing_screenshot_url",
].join(", ");

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiKey(req);
  if (isAuthError(auth)) return auth;

  const { id } = await context.params;

  try {
    const supabase = getSupabaseServer();

    const { data: submission, error } = await supabase
      .from("submissions")
      .select(SELECTED_FIELDS)
      .eq("id", id)
      .eq("public", true)
      .single();

    if (error || !submission) {
      return apiError("not_found", "Submission not found.", 404);
    }

    const row = submission as unknown as Record<string, unknown>;

    // Resolve image URLs
    row.image_url = await resolveImageUrl(
      supabase,
      row.image_url as string | null
    );
    row.landing_screenshot_url = await resolveImageUrl(
      supabase,
      row.landing_screenshot_url as string | null
    );

    // Fetch related violations
    const { data: violations } = await supabase
      .from("violations")
      .select(
        "id, submission_id, code, title, description, evidence_spans, severity, confidence, actblue_verified"
      )
      .eq("submission_id", id)
      .order("severity", { ascending: false });

    // Fetch related reports (exclude internal fields)
    const { data: reports } = await supabase
      .from("reports")
      .select(
        "id, case_id, to_email, cc_email, subject, body, html_body, landing_url, status, created_at"
      )
      .eq("case_id", id)
      .order("created_at", { ascending: false });

    // Fetch verdict
    const { data: verdicts } = await supabase
      .from("report_verdicts")
      .select(
        "id, case_id, verdict, explanation, determined_by, created_at, updated_at"
      )
      .eq("case_id", id)
      .order("created_at", { ascending: false });

    // Fetch comments
    const { data: comments } = await supabase
      .from("comments")
      .select("id, submission_id, content, kind, created_at")
      .eq("submission_id", id)
      .order("created_at", { ascending: true });

    return singleResponse({
      ...row,
      violations: violations || [],
      reports: reports || [],
      verdicts: verdicts || [],
      comments: comments || [],
    });
  } catch (err) {
    console.error(`/api/v1/submissions/${id} unexpected error`, err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
