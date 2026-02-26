import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import { apiError, parseArrayParam } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30";
  const senderNames = parseArrayParam(searchParams, "sender");
  const violationCodes = parseArrayParam(searchParams, "violation");

  try {
    const supabase = getSupabaseServer();

    let startDate: string | null = null;
    const now = new Date();

    if (range === "7") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString();
    } else if (range === "30") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString();
    } else if (range === "90") {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      startDate = d.toISOString();
    }
    // "lifetime" or anything else: startDate stays null

    const { data, error } = await supabase.rpc("get_stats", {
      start_date: startDate,
      end_date: now.toISOString(),
      sender_names: senderNames.length > 0 ? senderNames : null,
      violation_codes: violationCodes.length > 0 ? violationCodes : null,
      violation_permitted_flags: null,
      sources: null,
      message_types: null,
    });

    if (error) {
      console.error("/api/v1/stats error", error);
      return apiError("query_error", "Failed to fetch stats.", 500);
    }

    return NextResponse.json({ data: data || {} });
  } catch (err) {
    console.error("/api/v1/stats unexpected error", err);
    return apiError("internal_error", "Internal server error.", 500);
  }
}
