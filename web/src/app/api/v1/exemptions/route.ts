import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
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

  try {
    const supabase = getSupabaseServer();

    const builder = supabase
      .from("sender_violation_exemptions")
      .select("id, sender_pattern, violation_code, reason, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false });

    const { data, error, count } = await builder.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("/api/v1/exemptions error", error);
      return apiError("query_error", "Failed to fetch exemptions.", 500);
    }

    const total =
      typeof count === "number" ? count : (data || []).length + offset;
    return paginatedResponse(data || [], total, { limit, offset });
  } catch (err) {
    console.error("/api/v1/exemptions unexpected error", err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
