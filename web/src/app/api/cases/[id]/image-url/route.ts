import { NextRequest, NextResponse } from "next/server";
import { getCaseImageUrl } from "@/server/cases/detail";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await getCaseImageUrl(id));
  } catch {
    return NextResponse.json({ url: null, error: "unavailable" }, { status: 403 });
  }
}
