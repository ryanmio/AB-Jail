import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import {
  parsePagination,
  paginatedResponse,
  apiError,
} from "@/lib/api-utils";

const SELECTED_FIELDS =
  "id, case_id, verdict, explanation, determined_by, created_at, updated_at";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePagination(searchParams);

  const caseId = searchParams.get("case_id");
  const verdict = searchParams.get("verdict");

  try {
    const supabase = getSupabaseServer();

    let builder = supabase
      .from("report_verdicts")
      .select(SELECTED_FIELDS, { count: "exact" });

    if (caseId) builder = builder.eq("case_id", caseId);
    if (verdict) builder = builder.eq("verdict", verdict);

    builder = builder.order("created_at", { ascending: false });

    const { data, error, count } = await builder.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("/api/v1/verdicts error", error);
      return apiError("query_error", "Failed to fetch verdicts.", 500);
    }

    const total = typeof count === "number" ? count : (data || []).length + offset;
    return paginatedResponse(data || [], total, { limit, offset });
  } catch (err) {
    console.error("/api/v1/verdicts unexpected error", err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
