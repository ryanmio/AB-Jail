import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

// Public aggregate data - let the Vercel CDN serve repeat hits so the function
// isn't invoked for every visitor/crawler.
const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const recentLimit = Math.min(Number(searchParams.get("recent")) || 5, 10);
  const offendersLimit = Math.min(Number(searchParams.get("offenders")) || 10, 20);
  const reportsLimit = Math.min(Number(searchParams.get("reports")) || 5, 10);
  const days = searchParams.get("days"); // null = lifetime, number = last N days

  try {
    const supabase = getSupabaseServer();
    
    const { data, error } = await supabase.rpc("get_homepage_stats", {
      recent_limit: recentLimit,
      offenders_limit: offendersLimit,
      offenders_days: days ? Number(days) : null,
      reports_limit: reportsLimit,
    });

    if (error) {
      console.error("/api/homepage-stats error:", error);
      return NextResponse.json(
        { error: "Failed to fetch stats", detail: error.message },
        { status: 500 }
      );
    }

    // data is already a JSON object with recent_cases, worst_offenders, and recent_reports.
    if (data && Array.isArray(data.recent_reports)) {
      for (const entry of data.recent_reports) {
        if (entry?.report && typeof entry.report === "object") delete entry.report.cc_email;
      }
    }
    return NextResponse.json(data || { recent_cases: [], worst_offenders: [], recent_reports: [] }, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (err) {
    console.error("/api/homepage-stats unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

