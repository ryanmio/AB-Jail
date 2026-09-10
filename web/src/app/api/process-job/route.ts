import { NextRequest, NextResponse } from "next/server";
import { requireInternalSecret } from "@/lib/internal-auth";
import { triggerPipelines } from "@/server/ingest/save";

export async function POST(req: NextRequest) {
  const denied = requireInternalSecret(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const submissionId = body?.submissionId as string | undefined;
    const landingUrl = body?.landingUrl as string | null | undefined;
    
    if (!submissionId) {
      return NextResponse.json({ error: "submissionId required" }, { status: 400 });
    }
    
    console.log("/api/process-job:start", { submissionId, hasLandingUrl: !!landingUrl });
    
    // Run pipelines (classify + sender extraction)
    await triggerPipelines(submissionId);
    
    // If landing URL provided, trigger screenshot
    if (landingUrl) {
      const base = process.env.NEXT_PUBLIC_SITE_URL 
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
        || "http://localhost:3000";
      
      try {
        await fetch(`${base}/api/screenshot-actblue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: submissionId, url: landingUrl }),
        });
        console.log("/api/process-job:screenshot_triggered", { submissionId });
      } catch (e) {
        console.error("/api/process-job:screenshot_error", { submissionId, error: String(e) });
      }
    }
    
    console.log("/api/process-job:complete", { submissionId });
    return NextResponse.json({ ok: true, submissionId });
  } catch (e) {
    console.error("/api/process-job:error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

