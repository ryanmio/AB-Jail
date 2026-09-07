import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// Public aggregate data - let the Vercel CDN serve repeat hits so the function
// isn't invoked for every visitor/crawler.
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30";
  // Optional sender filter: support repeated or comma-separated `sender` values
  const sendersMulti = searchParams.getAll("sender");
  const sendersSingle = (searchParams.get("sender") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const senderNames = Array.from(new Set([...(sendersMulti || []), ...(sendersSingle || [])])).filter(Boolean);

  // Optional violation filter: support repeated `violation` values
  // Format: "AB001" or "AB008:permitted" or "AB008:unverified"
  const violationsRaw = searchParams.getAll("violation");
  const violationCodes: string[] = [];
  const violationPermittedFlags: (boolean | null)[] = [];
  
  violationsRaw.forEach((v) => {
    if (v.includes(":")) {
      const [code, flag] = v.split(":");
      violationCodes.push(code);
      violationPermittedFlags.push(flag === "permitted" ? true : flag === "unverified" ? false : null);
    } else {
      violationCodes.push(v);
      violationPermittedFlags.push(null);
    }
  });

  // Optional source filter: support repeated `source` values
  // Format: "user_upload" or "honeytrap"
  const sourcesRaw = searchParams.getAll("source");
  const sources = Array.from(new Set(sourcesRaw.filter(Boolean)));

  // Optional type filter: support repeated `type` values
  // Format: "sms", "email", "unknown"
  const typesRaw = searchParams.getAll("type");
  const types = Array.from(new Set(typesRaw.filter(Boolean)));

  try {
    const supabase = getSupabaseServer();
    
    // Calculate start date based on range
    let startDate: string | null = null;
    const now = new Date();
    
    if (range === "7") {
      const date = new Date(now);
      date.setDate(date.getDate() - 7);
      startDate = date.toISOString();
    } else if (range === "30") {
      const date = new Date(now);
      date.setDate(date.getDate() - 30);
      startDate = date.toISOString();
    } else if (range === "90") {
      const date = new Date(now);
      date.setDate(date.getDate() - 90);
      startDate = date.toISOString();
    }
    // else lifetime - startDate remains null

    // Call RPC function
    const { data, error } = await supabase.rpc("get_stats", {
      start_date: startDate,
      end_date: now.toISOString(),
      sender_names: senderNames.length > 0 ? senderNames : null,
      violation_codes: violationCodes.length > 0 ? violationCodes : null,
      violation_permitted_flags: violationPermittedFlags.length > 0 ? violationPermittedFlags : null,
      sources: sources.length > 0 ? sources : null,
      message_types: types.length > 0 ? types : null,
    });

    if (error) {
      console.error("/api/stats error:", error);
      return NextResponse.json(
        { error: "Failed to fetch stats", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || {}, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (err) {
    console.error("/api/stats unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
