import { NextRequest, NextResponse } from "next/server";
import { getCaseDetail } from "@/server/cases/detail";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const detail = await getCaseDetail(id);
    if (!detail) return NextResponse.json({ item: null, violations: [] }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    console.error("/api/cases/[id] supabase error", err);
    return NextResponse.json({ item: null, violations: [], comments: [], reports: [], report_replies: [] }, { status: 500 });
  }
}
