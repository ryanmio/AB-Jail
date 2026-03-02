import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import {
  parsePagination,
  paginatedResponse,
  apiError,
  parseArrayParam,
} from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePagination(searchParams);

  const codes = parseArrayParam(searchParams, "code");
  const submissionId = searchParams.get("submission_id");
  const severityMin = searchParams.get("severity_min");
  const actblueVerified = searchParams.get("actblue_verified");

  try {
    const supabase = getSupabaseAdmin();

    let builder = supabase
      .from("violations")
      .select(
        "id, submission_id, code, title, description, evidence_spans, severity, confidence, actblue_verified, submissions!inner(id)",
        { count: "exact" }
      )
      .eq("submissions.public", true);

    if (codes.length > 0) builder = builder.in("code", codes);
    if (submissionId) builder = builder.eq("submission_id", submissionId);
    if (severityMin) {
      const sev = Number(severityMin);
      if (isNaN(sev)) return apiError("invalid_param", "severity_min must be a number.", 400);
      builder = builder.gte("severity", sev);
    }
    if (actblueVerified === "true") builder = builder.eq("actblue_verified", true);
    if (actblueVerified === "false") builder = builder.eq("actblue_verified", false);

    builder = builder.order("severity", { ascending: false });

    const { data, error, count } = await builder.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("/api/v1/violations error", error);
      return apiError("query_error", "Failed to fetch violations.", 500);
    }

    const rows = (data || []) as unknown as Record<string, unknown>[];
    for (const row of rows) delete row.submissions;

    const total = typeof count === "number" ? count : rows.length + offset;
    return paginatedResponse(rows, total, { limit, offset });
  } catch (err) {
    console.error("/api/v1/violations unexpected error", err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
