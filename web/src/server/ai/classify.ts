/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServer } from "@/lib/supabase-server";
import { truncateForAI } from "./constants";

function parseSupabaseUrl(u?: string | null) {
  if (!u || !u.startsWith("supabase://")) return null;
  const rest = u.replace("supabase://", "");
  const [bucket, ...pathParts] = rest.split("/");
  return { bucket, path: pathParts.join("/") };
}

export type RunClassificationOptions = {
  includeExistingComments?: boolean;
  extraComments?: string[];
  replaceExisting?: boolean;
};

export async function runClassification(submissionId: string, opts: RunClassificationOptions = {}) {
  const supabase = getSupabaseServer();
  const start = Date.now();

  // Load submission
  const { data: items, error } = await supabase
    .from("submissions")
    .select("id, image_url, raw_text, landing_url, landing_screenshot_url, email_from, email_subject")
    .eq("id", submissionId)
    .limit(1);
  if (error || !items?.[0]) {
    return { ok: false, status: 404, error: "not_found" as const };
  }
  const sub = items[0] as { id: string; image_url?: string | null; raw_text?: string | null; landing_url?: string | null; landing_screenshot_url?: string | null; email_from?: string | null; email_subject?: string | null };

  // Prepare signed image URL if applicable (and only if extension is supported by OpenAI image_url)
  let signedUrl: string | null = null;
  const parsed = parseSupabaseUrl(sub.image_url);
  if (parsed) {
    const lowerPath = parsed.path.toLowerCase();
    const isSupportedExt = [".png", ".jpg", ".jpeg", ".gif", ".webp"].some((ext) => lowerPath.endsWith(ext));
    if (isSupportedExt) {
      const { data: signed } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 3600);
      signedUrl = signed?.signedUrl || null;
    } else {
      signedUrl = null;
    }
  }

  // Prepare landing page signed image if present
  let landingSignedUrl: string | null = null;
  const parsedLanding = parseSupabaseUrl((sub as any).landing_screenshot_url);
  if (parsedLanding) {
    const lowerPath = parsedLanding.path.toLowerCase();
    const isSupportedExt = [".png", ".jpg", ".jpeg", ".gif", ".webp"].some((ext) => lowerPath.endsWith(ext));
    if (isSupportedExt) {
      const { data: signed } = await supabase.storage.from(parsedLanding.bucket).createSignedUrl(parsedLanding.path, 3600);
      landingSignedUrl = signed?.signedUrl || null;
    }
  }

  // Helper: fetch a remote image URL and embed as data URL for OpenAI
  async function toDataUrlFromUrl(url: string): Promise<string | null> {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) return null;
      const mime = resp.headers.get("content-type") || "image/png";
      const ab = await resp.arrayBuffer();
      // Node Buffer is available in this runtime
      const b64 = Buffer.from(ab).toString("base64");
      return `data:${mime};base64,${b64}`;
    } catch {
      return null;
    }
  }

  // Build messages (shared across initial and reclassify)
  const system = `Role: Political Fundraising Compliance Assistant\n\nInstructions:\n- Accept OCR text and an optional screenshot image of the message. Use BOTH sources: read the text carefully and visually inspect the image when present.\n- Evaluate only for the provided 5 violation codes:\n  AB003: Missing Full Entity Name\n  AB004: Entity Clarity (Org vs Candidate)\n  AB007: False/Unsubstantiated Claims\n  AB008: Unverified Matching Program\n  AB009: Improper Use of ActBlue Name\n\n- Output STRICT JSON with these top-level keys, in order:\n  1. violations (array)\n  2. summary (string)\n  3. overall_confidence (float, 0–1 inclusive)\n- Each violation is returned as a single object with these keys: code (string), title (string), rationale (string), evidence_span_indices (array of integers), severity (int 1–5), confidence (float 0–1 inclusive).\n- Emit at most one violation object per code; if multiple findings, merge rationales and union indices for that code.\n\nSpecific rules and disambiguation:\n- AB003 (Missing Full Entity Name): Only flag when NO full entity name appears anywhere in the message itself, not considering any landing page images. If any full entity name is present (e.g., \"Let America Vote\"), DO NOT return AB003. Do not flag commonly accepted committee abbreviations such as DCCC, DLCC, or DSCC.\n- AB004 (Entity Clarity – Org vs Candidate): Flag when the message is ambiguous about whether donations go to a candidate or an organization/PAC. Do NOT flag joint or split fundraisers where the message names both the candidate and PAC and makes it reasonably clear that donations support both.\n- AB007 (False/Unsubstantiated Claims):\n  - Flag only for bullshit gimmicks that trick donors, like fake voting records or insinuating expiration of non-existent memberships/subscriptions, especially when implying membership to a political party requires a donation. Do not flag clearly defined "donor" or "supporter" status. Do NOT flag political rhetoric or news claims.\n\n- AB008 (Unverified Matching Program):\n  - Use when the message advertises a matching program (e.g., \"500% match\").\n  - Rationale text should clearly state that political committees almost never run genuine donor matching programs, and that such claims are highly improbable and misleading to donors.\n  - Do NOT say \"unsupported\" or \"not documented,\" since we cannot know whether documentation exists.\n  - Use direct phrasing such as:\n    \"This solicitation advertises a '500%-MATCH.' Political committees almost never run genuine donor matching programs, making this claim highly improbable and misleading to donors.\"\n- AB009 (Improper Use of ActBlue Name):\n  - Flag when the message uses ActBlue's name inappropriately or in a disparaging manner.\n  - Examples include: suggesting ActBlue \"may go away at any minute,\" falsely implying security or technical problems with ActBlue's platform, misrepresenting communications as being from ActBlue (e.g., sender name like \"NEW ActBlue Update\" when actually from a different entity), or undermining donor trust in ActBlue.\n  - Do NOT flag legitimate mentions of ActBlue (e.g., \"Donate via ActBlue\") or factual references to the platform (e.g., \"Republicans Subpoenaed ActBlue \").\n- AB007, AB008, AB009: Merge contributing lines into one object per code.\n\n- All confidence values must be floats (0–1).\n- evidence_span_indices must point to text spans; if the evidence is image-only, use an empty array and explain in the rationale (e.g., \"image shows unaffiliated candidates\").\n- If the message is malformed or incomplete, return: {\"violations\": [], \"summary\": \"Input message is malformed or incomplete.\", \"overall_confidence\": 0.1}\n- If no policy violations are found, return: {\"violations\": [], \"summary\": \"No clear violations.\", \"overall_confidence\": 0.3}\n\nOutput Format:\n- Output JSON only—no commentary or markdown.\n- Structure: { \"violations\": [ ... ], \"summary\": \"...\", \"overall_confidence\": ... }\n- Maintain the exact specified ordering of top-level keys and the strict schema.`;

  type Message = { role: "system" | "user"; content: any };
  
  // Build the initial message text with raw From line, subject, and body
  let messageText = "";
  if (sub.email_from) {
    messageText += `From: ${sub.email_from}\n`;
  }
  if (sub.email_subject) {
    messageText += `Subject: ${sub.email_subject}\n`;
  }
  if (sub.email_from || sub.email_subject) {
    messageText += `\n`;
  }
  messageText += String(sub.raw_text || "").trim() || "(none)";
  
  // Apply character limit to prevent abuse (rarely triggered in normal usage)
  messageText = truncateForAI(messageText);
  
  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: [ { type: "text", text: messageText } ] },
  ];
  if (signedUrl) {
    const dataUrl = await toDataUrlFromUrl(signedUrl);
    (messages[1].content as Array<{ type: string; image_url?: any; text?: string }>).push({ type: "image_url", image_url: { url: dataUrl || signedUrl } });
  }
  if (landingSignedUrl) {
    // Strip query params from landing_url when showing context
    let landingBase = sub.landing_url || null;
    try {
      if (sub.landing_url) {
        const u = new URL(sub.landing_url);
        landingBase = `${u.protocol}//${u.hostname}${u.pathname}`;
      }
    } catch {}
    if (landingBase) {
      (messages[1].content as Array<{ type: string; image_url?: any; text?: string }>)
        .push({ type: "text", text: `Landing page URL: ${landingBase}` });
    }
    const dataUrl = await toDataUrlFromUrl(landingSignedUrl);
    (messages[1].content as Array<{ type: string; image_url?: any; text?: string }>)
      .push({ type: "image_url", image_url: { url: dataUrl || landingSignedUrl } });
  }

  // Gather reviewer comments as additional context when requested
  const includeExisting = !!opts.includeExistingComments;
  const extra = Array.isArray(opts.extraComments) ? opts.extraComments : [];
  if (includeExisting || extra.length > 0) {
    const commentsList: string[] = [];
    if (includeExisting) {
      const { data: rows } = await supabase
        .from("comments")
        .select("content, created_at, kind")
        .eq("submission_id", submissionId)
        .in("kind", ["user", "landing_page"]) 
        .order("created_at", { ascending: true })
        .limit(50);
      for (const r of rows || []) {
        const c = (r as any).content as string;
        if (c && typeof c === "string") commentsList.push(c);
      }
    }
    for (const c of extra) {
      if (c && typeof c === "string") commentsList.push(c);
    }
    if (commentsList.length > 0) {
      const preface = "Additional reviewer comments and landing page context that should be considered:";
      const bulletList = commentsList.map((c) => `- ${c}`).join("\n");
      messages.push({ role: "user", content: [ { type: "text", text: `${preface}\n${bulletList}` } ] });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_VISION || "gpt-4o-mini";
  if (!apiKey) return { ok: false, status: 400, error: "openai_key_missing" as const };

  let parsedOut: Record<string, unknown> = {};
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, reasoning_effort: "low", verbosity: "low" }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      // ensure terminal error state to avoid stuck status
      await supabase.from("submissions").update({ processing_status: "error" }).eq("id", submissionId);
      return { ok: false, status: 502, error: "openai_failed" as const, detail: json };
    }
    const content = (json as any)?.choices?.[0]?.message?.content?.trim() || "{}";
    try {
      parsedOut = JSON.parse(content);
    } catch {
      parsedOut = { violations: [], summary: "Parse failed", overall_confidence: 0 } as any;
    }
  } catch {
    // ensure terminal error state to avoid stuck status
    await supabase.from("submissions").update({ processing_status: "error" }).eq("id", submissionId);
    return { ok: false, status: 500, error: "openai_failed" as const };
  }

  const violations = Array.isArray((parsedOut as any).violations) ? (parsedOut as any).violations as Array<any> : [];

  // Deduplicate by code and build rows
  const byCode = new Map<string, any>();
  for (const raw of violations) {
    const code = String((raw as any).code ?? "UNKNOWN");
    const title = String((raw as any).title ?? "Unspecified violation");
    const rationale = String((raw as any).rationale ?? "");
    const confidence = Number((raw as any).confidence ?? (parsedOut as any).overall_confidence ?? 0.5);
    const severity = Math.max(1, Math.min(5, Number((raw as any).severity ?? 1)));
    const evidence_spans = Array.isArray((raw as any).evidence_span_indices) ? (raw as any).evidence_span_indices : (raw as any).evidence_spans;
    const existing = byCode.get(code);
    if (!existing || confidence > existing.confidence) {
      byCode.set(code, { code, title, rationale, confidence, severity, evidence_spans: Array.isArray(evidence_spans) ? evidence_spans.slice(0) : [] });
    } else {
      if (rationale) existing.rationale = existing.rationale ? `${existing.rationale}; ${rationale}` : rationale;
      if (Array.isArray(evidence_spans)) existing.evidence_spans = [...(existing.evidence_spans || []), ...evidence_spans];
    }
  }

  if (opts.replaceExisting) {
    await supabase.from("violations").delete().eq("submission_id", submissionId);
  }

  if (byCode.size > 0) {
    const rows = Array.from(byCode.values()).map((v) => ({
      submission_id: submissionId,
      code: v.code,
      title: v.title,
      description: v.rationale,
      evidence_spans: v.evidence_spans ?? null,
      severity: v.severity,
      confidence: v.confidence,
    }));
    const { error: vioErr } = await supabase.from("violations").insert(rows);
    if (vioErr) {
      // If insertion fails after deletion, we at least mark error status
      await supabase.from("submissions").update({ processing_status: "error" }).eq("id", submissionId);
      return { ok: false, status: 500, error: "insert_failed" as const };
    }

    // Check for ActBlue-verified exemptions and mark matching violations
    try {
      await supabase.rpc("mark_verified_violations", { submission_id_param: submissionId });
    } catch (exemptionErr) {
      // Log but don't fail classification if exemption check fails
      console.warn("Failed to check exemptions:", exemptionErr);
    }
  } else if (opts.replaceExisting) {
    // Ensure we reflect no violations after replacement
  }

  const ms = Date.now() - start;
  await supabase
    .from("submissions")
    .update({
      processing_status: "done",
      classifier_ms: ms,
      ai_version: model,
      ai_confidence: (parsedOut as any).overall_confidence ?? null,
      ai_summary: typeof (parsedOut as any).summary === "string" ? (parsedOut as any).summary : null,
    })
    .eq("id", submissionId);

  return { ok: true as const, status: 200, violations: byCode.size, ms };
}


