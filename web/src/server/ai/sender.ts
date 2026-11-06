/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServer } from "@/lib/supabase-server";
import { env } from "@/lib/env";
import { truncateForAI } from "./constants";
import { cleanSenderName } from "./sender-name";

export type SenderType = "org" | "pac" | "candidate" | "unknown";

export async function runSenderExtraction(submissionId: string) {
  const supabase = getSupabaseServer();

  const { data: items, error } = await supabase
    .from("submissions")
    .select("id, image_url, raw_text, landing_screenshot_url")
    .eq("id", submissionId)
    .limit(1);
  if (error || !items?.[0]) {
    return { ok: false as const, status: 404, error: "not_found" as const };
  }
  const sub = items[0] as { id: string; image_url: string | null; raw_text: string | null; landing_screenshot_url: string | null };

  function parseSupabaseUrl(u?: string | null) {
    if (!u || !u.startsWith("supabase://")) return null as null | { bucket: string; path: string };
    const rest = u.replace("supabase://", "");
    const [bucket, ...pathParts] = rest.split("/");
    return { bucket, path: pathParts.join("/") };
  }

  let signedUrl: string | null = null;
  const parsed = parseSupabaseUrl(sub.image_url);
  if (parsed) {
    try {
      const { data: signed } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 3600);
      signedUrl = signed?.signedUrl || null;
    } catch {
      // ignore signing error; proceed with text-only
    }
  }

  let landingSignedUrl: string | null = null;
  const parsedLanding = parseSupabaseUrl(sub.landing_screenshot_url);
  if (parsedLanding) {
    try {
      const { data: signed } = await supabase.storage.from(parsedLanding.bucket).createSignedUrl(parsedLanding.path, 3600);
      landingSignedUrl = signed?.signedUrl || null;
    } catch {
      // ignore signing error; proceed without landing screenshot
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false as const, status: 400, error: "openai_key_missing" as const };
  const model = process.env.OPENAI_MODEL_VISION || "gpt-5-mini-2025-08-07";

  type ImageUrlPart = { type: "image_url"; image_url: { url: string } };
  type TextPart = { type: "text"; text: string };
  type ContentPart = ImageUrlPart | TextPart;
  type Message = { role: "system" | "user"; content: string | ContentPart[] };

  // Build system prompt with honeytrap examples (if configured)
  const honeytrapEmails = env.HONEYTRAP_EMAILS 
    ? env.HONEYTRAP_EMAILS.split(',').map(e => e.trim()).filter(e => e.length > 0)
    : [];
  
  const honeytrapExample = honeytrapEmails.length > 0 
    ? `(e.g., ${honeytrapEmails[0]})` 
    : "(e.g., personal email addresses)";
  
  const system = `You are reviewing a political fundraising appeal to extract the ORIGINAL sending entity.\n\nGoals:\n- Identify the organization, PAC, or candidate responsible for the ORIGINAL message content (not any forwarder).\n- Ignore forwarding/relay info such as personal names or emails in headers like \'From:\' showing gmail/outlook/yahoo, \'Fwd:\', \'Forwarded message\', or \'via\'. These are often the person who forwarded the message.\n- Prefer explicit disclosures (e.g., \'Paid for by ...\'), unsubscribe/footer branding, sender lines, or signature blocks from the ORIGINAL content.\n- If the message was forwarded by an individual ${honeytrapExample} but the original is from an entity (e.g., Stop Republicans PAC), USE THE ORIGINAL ENTITY as the sender.\n- Use the screenshot image (logos/branding) to corroborate when available.\n- If multiple entities appear, choose the one that claims responsibility for fundraising/spending in the disclaimer; otherwise pick the most prominent org/PAC/campaign.\n- If none is provided, return sender_name = null and sender_type = \"unknown\".\n\nOutput JSON only (no markdown), with keys:\n{\n  "sender_name": string | null,\n  "sender_type": "org" | "pac" | "candidate" | "unknown",\n  "confidence": number (0..1),\n  "notes": string\n}`;

  // Apply character limit to prevent abuse (rarely triggered in normal usage)
  const rawText = truncateForAI(String(sub.raw_text || "").trim() || "(none)");
  const userContent: ContentPart[] = [ { type: "text", text: rawText } ];
  if (signedUrl) userContent.push({ type: "image_url", image_url: { url: signedUrl } });
  if (landingSignedUrl) userContent.push({ type: "image_url", image_url: { url: landingSignedUrl } });
  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: userContent },
  ];

  let parsedOut: { sender_name: string | null; sender_type: SenderType; confidence: number; notes?: string } = {
    sender_name: null,
    sender_type: "unknown",
    confidence: 0.2,
  };
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, reasoning_effort: "low", verbosity: "low" }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      return { ok: false as const, status: 502, error: "openai_failed" as const, detail: json } as const;
    }
    const maybeContent = (json as any)?.choices?.[0]?.message?.content;
    const content = typeof maybeContent === "string" ? maybeContent.trim() : "";
    try {
      const obj = JSON.parse(content || "{}");
      parsedOut = {
        sender_name: typeof obj.sender_name === "string" && obj.sender_name.trim() ? obj.sender_name.trim() : null,
        sender_type: (obj.sender_type === "org" || obj.sender_type === "pac" || obj.sender_type === "candidate" || obj.sender_type === "unknown") ? obj.sender_type : "unknown",
        confidence: typeof obj.confidence === "number" ? obj.confidence : 0.2,
        notes: typeof obj.notes === "string" ? obj.notes : undefined,
      };
    } catch {
      parsedOut = { sender_name: null, sender_type: "unknown", confidence: 0.2, notes: "Parse failed" };
    }
  } catch {
    return { ok: false as const, status: 500, error: "openai_failed" as const };
  }

  const senderName = cleanSenderName(parsedOut.sender_name);
  try {
    await supabase
      .from("submissions")
      .update({ sender_name: senderName })
      .eq("id", submissionId);
  } catch {
    // ignore update failures for sender
  }
  return { ok: true as const, status: 200 };
}


