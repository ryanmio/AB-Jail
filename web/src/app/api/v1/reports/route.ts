import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import {
  parsePagination,
  paginatedResponse,
  apiError,
} from "@/lib/api-utils";

const SELECTED_FIELDS =
  "id, case_id, to_email, cc_email, subject, body, html_body, landing_url, status, created_at";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePagination(searchParams);

  const caseId = searchParams.get("case_id");
  const status = searchParams.get("status");

  try {
    const supabase = getSupabaseServer();

    let builder = supabase
      .from("reports")
      .select(SELECTED_FIELDS, { count: "exact" });

    if (caseId) builder = builder.eq("case_id", caseId);
    if (status) builder = builder.eq("status", status);

    builder = builder.order("created_at", { ascending: false });

    const { data, error, count } = await builder.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("/api/v1/reports error", error);
      return apiError("query_error", "Failed to fetch reports.", 500);
    }

    const total = typeof count === "number" ? count : (data || []).length + offset;
    return paginatedResponse(data || [], total, { limit, offset });
  } catch (err) {
    console.error("/api/v1/reports unexpected error", err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
