import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { ingestTextSubmission, triggerPipelines } from "@/server/ingest/save";
import { repairMojibake, cleanTextForAI, normalizePunctuation } from "@/server/ingest/text-cleaner";

// Twilio signs each webhook: base64(HMAC-SHA1(auth_token, url + sorted(key+value) of POST params)).
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
// Behind Vercel the URL Twilio used is the public one, so try the configured
// site URL first and the raw request URL second.
function verifyTwilioSignature(req: NextRequest, params: URLSearchParams): boolean {
  const token = env.TWILIO_AUTH_TOKEN;
  if (!token) {
    console.error("/api/inbound-sms: TWILIO_AUTH_TOKEN not set; rejecting");
    return false;
  }
  const provided = req.headers.get("x-twilio-signature") || "";
  if (!provided) return false;
  const sorted = Array.from(params.keys()).sort().map((k) => k + (params.get(k) ?? "")).join("");
  const { pathname, search } = req.nextUrl;
  const candidates = new Set<string>();
  if (env.NEXT_PUBLIC_SITE_URL) candidates.add(`${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}${pathname}${search}`);
  candidates.add(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) candidates.add(`https://${host}${pathname}${search}`);
  const given = Buffer.from(provided);
  for (const url of candidates) {
    const expected = Buffer.from(createHmac("sha1", token).update(url + sorted).digest("base64"));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

// Twilio will POST with application/x-www-form-urlencoded by default
export async function POST(req: NextRequest) {
  // Twilio expects a 200 with TwiML (or empty <Response/>)
  try {
    console.log("/api/inbound-sms:start", {
      ct: req.headers.get("content-type") || null,
      twilioSig: req.headers.get("x-twilio-signature") || null,
    });
    const contentType = req.headers.get("content-type") || "";
    let bodyText = "";
    let fromNumber = "";
    const mediaUrls: Array<{ url: string; contentType?: string }> = [];

    // Twilio always posts application/x-www-form-urlencoded and signs the
    // request. Anything else is not Twilio; without this check anyone could
    // create public SMS cases attributed to any number.
    if (contentType.includes("application/json")) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Read raw body as UTF-8 and manually parse to ensure proper encoding
      const rawBody = await req.text();
      const params = new URLSearchParams(rawBody);
      if (!verifyTwilioSignature(req, params)) {
        console.warn("/api/inbound-sms:rejected invalid_signature");
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
      }
      bodyText = params.get("Body") || "";
      fromNumber = params.get("From") || "";
      
      // Parse media attachments (MMS)
      const numMedia = parseInt(params.get("NumMedia") || "0", 10);
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        const mediaContentType = params.get(`MediaContentType${i}`);
        if (mediaUrl) {
          mediaUrls.push({
            url: mediaUrl,
            contentType: mediaContentType || undefined,
          });
        }
      }
    } else {
      // Best-effort: try reading as text and parsing as URLSearchParams
      const rawBody = await req.text();
      const params = new URLSearchParams(rawBody);
      if (!verifyTwilioSignature(req, params)) {
        console.warn("/api/inbound-sms:rejected invalid_signature");
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
      }
      bodyText = params.get("Body") || "";
      fromNumber = params.get("From") || "";
      
      // Parse media attachments (MMS)
      const numMedia = parseInt(params.get("NumMedia") || "0", 10);
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params.get(`MediaUrl${i}`);
        const mediaContentType = params.get(`MediaContentType${i}`);
        if (mediaUrl) {
          mediaUrls.push({
            url: mediaUrl,
            contentType: mediaContentType || undefined,
          });
        }
      }
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("/api/inbound-sms:error service_key_missing");
      return xmlResponse(`<Response></Response>`, 400);
    }

    // Preserve raw text (as received) for dedupe/url extraction context
    const rawText = bodyText || "";

    // Repair common mojibake and normalize punctuation for consistent heuristics
    const repaired = normalizePunctuation(repairMojibake(rawText));
    const cleanedForAI = cleanTextForAI(repaired);

    // Insert into Supabase (with duplicate detection inside ingestTextSubmission)
    const result = await ingestTextSubmission({
      text: cleanedForAI || "",
      rawText,
      senderId: fromNumber || null,
      messageType: "sms",
      imageUrlPlaceholder: "sms://no-image",
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    });
    console.log("/api/inbound-sms:ingested", {
      ok: result.ok,
      id: result.id || null,
      from: fromNumber || null,
      bodyLen: rawText ? rawText.length : 0,
      numMedia: mediaUrls.length,
      mediaContentTypes: mediaUrls.map(m => m.contentType).filter(Boolean),
      isFundraising: result.isFundraising ?? null,
      heuristic: result.heuristic || null,
    });
    if (!result.ok) {
      if (result.error === "duplicate") {
        console.log("/api/inbound-sms:duplicate", { existingId: result.id || null, from: fromNumber || null });
        return xmlResponse(`<Response></Response>`, 200);
      }
      if (!result.id) {
      console.error("/api/inbound-sms:ingest_failed", result);
      return xmlResponse(`<Response></Response>`, 500);
      }
    }

    // For fundraising, trigger pipelines (classify + sender extraction)
    // Use same pattern as email: await triggerPipelines directly
    if (result.isFundraising && result.id) {
      console.log("/api/inbound-sms:triggering_pipelines", { 
        submissionId: result.id,
        hasLandingUrl: !!result.landingUrl
      });
      
      // Run pipelines synchronously like email does
      const pipelinesStart = Date.now();
      await triggerPipelines(result.id);
      const pipelinesElapsed = Date.now() - pipelinesStart;
      
      console.log("/api/inbound-sms:pipelines_completed", { 
        submissionId: result.id,
        elapsedMs: pipelinesElapsed
      });
      
      // If landing URL detected, trigger screenshot
      if (result.landingUrl) {
        const base = process.env.NEXT_PUBLIC_SITE_URL 
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
          || "http://localhost:3000";
        
        // Fire-and-forget for screenshot (can take 15+ seconds)
        fetch(`${base}/api/screenshot-actblue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: result.id, url: result.landingUrl }),
        }).catch((e) => {
          console.error("/api/inbound-sms:screenshot_error", { submissionId: result.id, error: String(e) });
        });
      }
    } else {
      console.log("/api/inbound-sms:skipped_triggers_non_fundraising", { submissionId: result.id });
    }

    // Twilio compatible empty response
    return xmlResponse(`<Response></Response>`, 200);
  } catch (e) {
    console.error("/api/inbound-sms:exception", e);
    return xmlResponse(`<Response></Response>`, 500);
  }
}

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}


