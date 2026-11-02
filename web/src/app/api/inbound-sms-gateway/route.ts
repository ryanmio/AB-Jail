import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { getSupabaseServer } from "@/lib/supabase-server";
import { ingestTextSubmission, triggerPipelines } from "@/server/ingest/save";
import { repairMojibake, cleanTextForAI, normalizePunctuation } from "@/server/ingest/text-cleaner";

/**
 * Webhook receiver for "SMS Gateway for Android" (capcom6/android-sms-gateway).
 *
 * The app sends one POST per event. Two events matter here:
 *   - sms:received   -> payload.message / payload.sender / payload.receivedAt
 *   - mms:downloaded -> payload.body / payload.subject / payload.attachments[] (base64) / payload.sender
 *
 * Attachments are uploaded to the "incoming" bucket and the first image becomes the
 * submission's image_url (supabase://bucket/path), which the classify/sender pipelines
 * already know how to sign and read. Any extra attachments go into media_urls.
 *
 * Duplicates and empty messages return 200 so the phone does not retry them.
 */

type GatewayAttachment = {
  partId?: number | string;
  contentType?: string | null;
  name?: string | null;
  size?: number | null;
  data?: string | null; // base64
};

type GatewayEnvelope = {
  id?: string;
  event?: string;
  deviceId?: string;
  webhookId?: string;
  payload?: {
    messageId?: string | number;
    message?: string | null; // sms:received
    body?: string | null; // mms:downloaded
    subject?: string | null;
    sender?: string | null;
    phoneNumber?: string | null; // older builds
    recipient?: string | null;
    simNumber?: number | null;
    receivedAt?: string | null;
    attachments?: GatewayAttachment[] | null;
  };
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"]);

function extFor(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct === "image/jpeg" || ct === "image/jpg") return "jpg";
  if (ct === "image/png") return "png";
  if (ct === "image/gif") return "gif";
  if (ct === "image/webp") return "webp";
  if (ct === "image/heic") return "heic";
  if (ct === "image/heif") return "heif";
  if (ct === "video/mp4") return "mp4";
  if (ct === "text/plain") return "txt";
  if (ct === "text/x-vcard" || ct === "text/vcard") return "vcf";
  return "bin";
}

// Required: SMS_GATEWAY_SIGNING_KEY must be set (same value as the app's
// Settings -> Webhooks -> Signing Key). The app signs `${body}${timestamp}` with
// HMAC-SHA256 (hex) and sends X-Signature / X-Timestamp (unix seconds).
const MAX_SKEW_SECONDS = 5 * 60;

function signatureOk(rawBody: string, req: NextRequest): "ok" | "unconfigured" | "bad" {
  const key = process.env.SMS_GATEWAY_SIGNING_KEY;
  if (!key) return "unconfigured";
  const sig = req.headers.get("x-signature") || "";
  const ts = req.headers.get("x-timestamp") || "";
  if (!sig || !ts) return "bad";
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_SKEW_SECONDS) return "bad";
  const expected = createHmac("sha256", key).update(rawBody + ts).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(sig, "hex");
    return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "bad";
  } catch {
    return "bad";
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sigState = signatureOk(rawBody, req);
    if (sigState !== "ok") {
      // "unconfigured" = env var missing on this deployment
      console.warn("/api/inbound-sms-gateway:rejected", { reason: sigState });
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    let env_: GatewayEnvelope = {};
    try {
      env_ = JSON.parse(rawBody) as GatewayEnvelope;
    } catch {
      console.warn("/api/inbound-sms-gateway:bad_json", { len: rawBody.length });
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const event = String(env_.event || "");
    const p = env_.payload || {};
    console.log("/api/inbound-sms-gateway:start", {
      event,
      deviceId: env_.deviceId || null,
      messageId: p.messageId ?? null,
      sender: p.sender || p.phoneNumber || null,
      payloadKeys: Object.keys(p),
      bodyLen: typeof p.body === "string" ? p.body.length : null,
      subjectLen: typeof p.subject === "string" ? p.subject.length : null,
      attachments: Array.isArray(p.attachments)
        ? p.attachments.map((a) => ({ ct: a?.contentType || null, size: a?.size ?? null, hasData: !!a?.data }))
        : [],
    });

    // mms:received fires before the content is downloaded; mms:downloaded has the content.
    // Anything other than sms:received / mms:downloaded is acknowledged and ignored.
    if (event !== "sms:received" && event !== "mms:downloaded") {
      return NextResponse.json({ ok: true, ignored: event || "unknown" }, { status: 200 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("/api/inbound-sms-gateway:error service_key_missing");
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    const fromNumber = String(p.sender || p.phoneNumber || "").trim();
    const subject = String(p.subject || "").trim();
    let text = String(event === "sms:received" ? p.message || "" : p.body || "").trim();
    if (!text && subject) text = subject;

    // ---- Attachments (MMS only) ----
    const supabase = getSupabaseServer();
    const bucket = env.SUPABASE_BUCKET_INCOMING || "incoming";
    const folder = randomUUID();
    let primaryImageUrl: string | null = null;
    const mediaUrls: Array<{ url: string; contentType?: string }> = [];
    const attachments = Array.isArray(p.attachments) ? p.attachments : [];

    for (let i = 0; i < attachments.length; i++) {
      const a = attachments[i] || {};
      const ct = String(a.contentType || "application/octet-stream").toLowerCase();
      // The app also sends the text parts and the SMIL layout as attachments; fold text in, skip layout.
      if (ct.startsWith("text/plain")) {
        if (a.data) {
          const t = Buffer.from(String(a.data), "base64").toString("utf8").trim();
          if (t && !text.includes(t)) text = text ? `${text}\n${t}` : t;
        }
        continue;
      }
      if (ct.includes("smil")) continue;
      if (!a.data) continue;

      const bytes = Buffer.from(String(a.data), "base64");
      if (!bytes.length) continue;
      const objectPath = `${folder}/mms-${i}.${extFor(ct)}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
        contentType: ct,
        upsert: false,
      });
      if (upErr) {
        console.error("/api/inbound-sms-gateway:upload_failed", { objectPath, error: upErr.message });
        continue;
      }
      const url = `supabase://${bucket}/${objectPath}`;
      if (!primaryImageUrl && IMAGE_TYPES.has(ct)) {
        primaryImageUrl = url;
      } else {
        mediaUrls.push({ url, contentType: ct });
      }
    }

    if (!text && !primaryImageUrl) {
      console.warn("/api/inbound-sms-gateway:empty", { event, from: fromNumber || null });
      return NextResponse.json({ ok: true, empty: true }, { status: 200 });
    }

    const repaired = normalizePunctuation(repairMojibake(text));
    const cleanedForAI = cleanTextForAI(repaired);

    // Image-only MMS: an empty body would hash to the same value every time and
    // collide with the previous image-only message. Give dedupe a per-message key
    // instead so each image-only message is stored.
    const dedupeText = text
      ? text
      : `image-only mms ${env_.deviceId || "device"} ${p.messageId ?? ""} ${p.receivedAt || Date.now()}`;

    const result = await ingestTextSubmission({
      text: cleanedForAI || "",
      rawText: dedupeText,
      senderId: fromNumber || null,
      messageType: "sms",
      imageUrlPlaceholder: primaryImageUrl || "sms://no-image",
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    });

    console.log("/api/inbound-sms-gateway:ingested", {
      event,
      ok: result.ok,
      id: result.id || null,
      from: fromNumber || null,
      bodyLen: text.length,
      hasImage: !!primaryImageUrl,
      extraMedia: mediaUrls.length,
      receivedAt: p.receivedAt || null,
      isFundraising: result.isFundraising ?? null,
      heuristic: result.heuristic || null,
    });

    if (!result.ok) {
      const err = String(result.error || "");
      const isDuplicate = err === "duplicate" || /duplicate key value|normalized_hash/i.test(err);
      if (isDuplicate) {
        console.log("/api/inbound-sms-gateway:duplicate", { existingId: result.id || null, from: fromNumber || null });
        return NextResponse.json({ ok: true, duplicate: true, id: result.id || null }, { status: 200 });
      }
      console.error("/api/inbound-sms-gateway:ingest_failed", result);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    if (result.isFundraising && result.id) {
      const t0 = Date.now();
      await triggerPipelines(result.id);
      console.log("/api/inbound-sms-gateway:pipelines_completed", { submissionId: result.id, elapsedMs: Date.now() - t0 });

      if (result.landingUrl) {
        const base = process.env.NEXT_PUBLIC_SITE_URL
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
          || "http://localhost:3000";
        after(() => fetch(`${base}/api/screenshot-actblue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: result.id, url: result.landingUrl }),
        }).catch((e) => {
          console.error("/api/inbound-sms-gateway:screenshot_error", { submissionId: result.id, error: String(e) });
        }));
      }
    }

    return NextResponse.json({ ok: true, id: result.id || null }, { status: 200 });
  } catch (e) {
    console.error("/api/inbound-sms-gateway:exception", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
