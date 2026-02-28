import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import {
  parsePagination,
  paginatedResponse,
  apiError,
} from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePagination(searchParams);

  const submissionId = searchParams.get("submission_id");
  const kind = searchParams.get("kind");

  try {
    const supabase = getSupabaseAdmin();

    let builder = supabase
      .from("comments")
      .select("id, submission_id, content, kind, created_at, submissions!inner(id)", {
        count: "exact",
      })
      .eq("submissions.public", true);

    if (submissionId) builder = builder.eq("submission_id", submissionId);
    if (kind) builder = builder.eq("kind", kind);

    builder = builder.order("created_at", { ascending: false });

    const { data, error, count } = await builder.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("/api/v1/comments error", error);
      return apiError("query_error", "Failed to fetch comments.", 500);
    }

    const rows = (data || []) as unknown as Record<string, unknown>[];
    for (const row of rows) delete row.submissions;

    const total =
      typeof count === "number" ? count : rows.length + offset;
    return paginatedResponse(rows, total, { limit, offset });
  } catch (err) {
    console.error("/api/v1/comments unexpected error", err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
