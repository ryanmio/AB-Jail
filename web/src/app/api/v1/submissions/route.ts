import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import {
  parsePagination,
  paginatedResponse,
  apiError,
  resolveImageUrls,
} from "@/lib/api-utils";

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

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePagination(searchParams);

  const senderName = searchParams.get("sender_name");
  const senderId = searchParams.get("sender_id");
  const messageType = searchParams.get("message_type");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const hasViolations = searchParams.get("has_violations");
  const q = (searchParams.get("q") || "").trim();

  try {
    const supabase = getSupabaseServer();

    // Use inner/left join to filter by violation existence (avoids URL-length issues)
    const selectExpr =
      hasViolations === "true"
        ? SELECTED_FIELDS + ", violations!inner(id)"
        : hasViolations === "false"
          ? SELECTED_FIELDS + ", violations!left(id)"
          : SELECTED_FIELDS;

    let builder = supabase
      .from("submissions")
      .select(selectExpr, { count: "exact" })
      .eq("public", true);

    if (hasViolations === "false") {
      builder = builder.is("violations", null);
    }

    if (senderName) builder = builder.ilike("sender_name", `%${senderName}%`);
    if (senderId) builder = builder.ilike("sender_id", `%${senderId}%`);
    if (messageType) builder = builder.eq("message_type", messageType);
    if (dateFrom) builder = builder.gte("sort_date", dateFrom);
    if (dateTo) builder = builder.lte("sort_date", dateTo);
    if (q) {
      const sanitized = q.replace(/[%,().]/g, "");
      if (sanitized.length > 0) {
        builder = builder.or(
          `sender_name.ilike.%${sanitized}%,sender_id.ilike.%${sanitized}%,raw_text.ilike.%${sanitized}%`
        );
      }
    }

    builder = builder.order("sort_date", { ascending: false });

    const { data, error, count } = await builder.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      console.error("/api/v1/submissions error", error);
      return apiError("query_error", "Failed to fetch submissions.", 500);
    }

    const rows = (data || []) as unknown as Record<string, unknown>[];

    // Strip the joined violations field from the response
    if (hasViolations === "true" || hasViolations === "false") {
      for (const row of rows) {
        delete row.violations;
      }
    }

    await resolveImageUrls(
      supabase,
      rows as unknown as Array<{ image_url?: string | null; landing_screenshot_url?: string | null }>
    );

    const total = typeof count === "number" ? count : rows.length + offset;
    return paginatedResponse(rows, total, { limit, offset });
  } catch (err) {
    console.error("/api/v1/submissions unexpected error", err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
