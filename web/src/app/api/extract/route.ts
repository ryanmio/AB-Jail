import { NextRequest, NextResponse } from "next/server";
import { requireInternalSecret } from "@/lib/internal-auth";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const denied = requireInternalSecret(req);
  if (denied) return denied;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "service_key_missing" }, { status: 400 });
  }
  const supabase = getSupabaseServer();
  const body = await req.json().catch(() => null);
  const submissionId: string | undefined = body?.submissionId;
  const dataUrl: string | undefined = body?.dataUrl; // data:image/...;base64,xxxx
  if (!submissionId || !dataUrl) return NextResponse.json({ error: "missing_args" }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_VISION || "gpt-4o-mini";
  if (!apiKey) return NextResponse.json({ error: "openai_key_missing" }, { status: 400 });

  const [, base64] = dataUrl.split(",");
  const imageMediaType = (dataUrl.match(/^data:(.*?);base64,/)?.[1]) || "image/png";
  const imageB64 = base64;

  const prompt = "You are an OCR assistant. Extract plain text from this screenshot. Return only the text, no explanations.";

  let rawText = "";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${imageMediaType};base64,${imageB64}` } },
            ],
          },
        ]
      }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      console.error("openai_error", json);
      return NextResponse.json({ error: "openai_failed", detail: json }, { status: 502 });
    }
    rawText = json?.choices?.[0]?.message?.content || "";
  } catch {
    return NextResponse.json({ error: "openai_failed" }, { status: 500 });
  }

  const { error: updErr } = await supabase.from("submissions").update({ raw_text: rawText }).eq("id", submissionId);
  if (updErr) {
    console.error("update_failed", updErr);
    return NextResponse.json({ error: "update_failed", detail: updErr.message, rawText }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rawText });
}
