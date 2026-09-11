import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { runClassification } from "@/server/ai/classify";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "service_key_missing" }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "openai_key_missing" }, { status: 400 });
  }

  const { id } = await context.params;
  const body = await req.json().catch(() => null) as { content?: string } | null;
  const content = (body?.content || "").trim();
  if (!content) return NextResponse.json({ error: "empty_content" }, { status: 400 });
  if (content.length > 240) return NextResponse.json({ error: "content_too_long" }, { status: 400 });

  const supabase = getSupabaseServer();

  // enforce per-submission cap of 10 comments
  const { count: existingCount, error: countErr } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", id);
  if (countErr) return NextResponse.json({ error: "count_failed" }, { status: 500 });
  if ((existingCount ?? 0) >= 10) {
    return NextResponse.json({ error: "comments_limit_reached" }, { status: 429 });
  }

  const { error: insErr } = await supabase.from("comments").insert({ submission_id: id, content, kind: "user" });
  if (insErr) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  // mark in-progress so UI polls
  await supabase.from("submissions").update({ processing_status: "classified" }).eq("id", id);

  // audit now
  await supabase.from("audit_log").insert({ action: "reclassify", actor: "anonymous", submission_id: id, payload: { via: "comment", length: content.length } });

  // Run reclassification and propagate terminal status to avoid stuck states
  try {
    const result = await runClassification(id, { includeExistingComments: true, replaceExisting: true });
    if (!result.ok) {
      await supabase.from("submissions").update({ processing_status: "error" }).eq("id", id);
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, violations: result.violations, ms: result.ms });
  } catch {
    await supabase.from("submissions").update({ processing_status: "error" }).eq("id", id);
    return NextResponse.json({ ok: false, error: "reclassify_failed" }, { status: 500 });
  }
}


