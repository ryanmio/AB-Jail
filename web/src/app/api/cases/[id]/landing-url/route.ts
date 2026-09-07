import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
import { getCaseLandingUrl } from "@/server/cases/detail";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await getCaseLandingUrl(id));
  } catch {
    return NextResponse.json({ url: null, landingUrl: null, status: null, error: "unavailable" }, { status: 403 });
  }
}
