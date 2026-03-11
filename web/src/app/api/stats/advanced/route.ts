import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30";

  const sendersMulti = searchParams.getAll("sender");
  const sendersSingle = (searchParams.get("sender") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const senderNames = Array.from(
    new Set([...(sendersMulti || []), ...(sendersSingle || [])])
  ).filter(Boolean);

  const violationsRaw = searchParams.getAll("violation");
  const violationCodes: string[] = [];
  const violationPermittedFlags: (boolean | null)[] = [];

  violationsRaw.forEach((v) => {
    if (v.includes(":")) {
      const [code, flag] = v.split(":");
      violationCodes.push(code);
      violationPermittedFlags.push(
        flag === "permitted" ? true : flag === "unverified" ? false : null
      );
    } else {
      violationCodes.push(v);
      violationPermittedFlags.push(null);
    }
  });

  const sourcesRaw = searchParams.getAll("source");
  const sources = Array.from(new Set(sourcesRaw.filter(Boolean)));

  const typesRaw = searchParams.getAll("type");
  const types = Array.from(new Set(typesRaw.filter(Boolean)));

  try {
    const supabase = getSupabaseServer();

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

    const { data, error } = await supabase.rpc("get_advanced_stats", {
      start_date: startDate,
      end_date: now.toISOString(),
      sender_names: senderNames.length > 0 ? senderNames : null,
      violation_codes: violationCodes.length > 0 ? violationCodes : null,
      violation_permitted_flags:
        violationPermittedFlags.length > 0 ? violationPermittedFlags : null,
      sources: sources.length > 0 ? sources : null,
      message_types: types.length > 0 ? types : null,
    });

    if (error) {
      console.error("/api/stats/advanced error:", error);
      return NextResponse.json(
        { error: "Failed to fetch advanced stats", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || {});
  } catch (err) {
    console.error("/api/stats/advanced unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
