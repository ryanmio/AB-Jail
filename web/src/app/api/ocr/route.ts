import { NextRequest, NextResponse } from "next/server";
import { internalHeaders } from "@/lib/internal-auth";
export const runtime = "nodejs";
import { getSupabaseServer } from "@/lib/supabase-server";
import { env } from "@/lib/env";
import { buildDedupeFields, findDuplicateCase } from "@/server/ingest/dedupe";
import sharp from "sharp";
import { detectScreenshotType } from "@/server/ai/detect-type";

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "service_key_missing" }, { status: 400 });
  }
  const supabase = getSupabaseServer();
  const body = await req.json().catch(() => null);
  const submissionId: string | undefined = body?.submissionId;
  const dataUrl: string | undefined = body?.dataUrl;
  if (!submissionId || !dataUrl) return NextResponse.json({ error: "missing_args" }, { status: 400 });

  const start = Date.now();
  // Parse data URL
  const headerEnd = dataUrl.indexOf(",");
  const header = headerEnd > 0 ? dataUrl.slice(0, headerEnd) : "";
  const mimeMatch = /^data:([^;]+);base64$/.exec(header.replace(/^data:/, "data:"));
  const mime = mimeMatch?.[1] || "image/jpeg";
  const isPdf = mime === "application/pdf";
  const [, base64] = dataUrl.split(",");
  const imgBuf = Buffer.from(base64, "base64");
  console.log("/api/ocr:start", { submissionId, inBytes: imgBuf.length });

  let processed: Buffer;
  if (isPdf) {
    // Skip image preprocessing for PDFs; send PDF as-is to OCR.space
    processed = imgBuf;
  } else {
    try {
      const preStart = Date.now();
      processed = await sharp(imgBuf)
        .resize({ width: 1600, withoutEnlargement: false })
        .grayscale()
        .normalise()
        .threshold(180)
        .toFormat("png")
        .toBuffer();
      console.log("/api/ocr:preprocess_ok", { outBytes: processed.length, ms: Date.now() - preStart });
    } catch (e) {
      console.warn("/api/ocr:preprocess_failed — using original image", String(e));
      processed = imgBuf;
    }
  }

  // OCR via hosted Tesseract (OCR.space)
  let text = "";
  let conf = 0;
  const ocrMethod = "ocrspace" as const;
  if (!env.OCRSPACE_API_KEY) {
    return NextResponse.json({ error: "ocrspace_key_missing" }, { status: 400 });
  }

  async function callOcrSpace(dataUri: string, timeoutMs: number, filetype?: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const form = new URLSearchParams();
      form.set("apikey", env.OCRSPACE_API_KEY as string);
      form.set("base64Image", dataUri);
      if (filetype) form.set("filetype", filetype);
      form.set("language", "eng");
      form.set("isOverlayRequired", "false");
      const attemptStart = Date.now();
      const resp = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: controller.signal,
      });
      const json = await resp.json();
      
      // Check if we have parsed results even if IsErroredOnProcessing is true
      // OCR.space sets IsErroredOnProcessing=true for page limit warnings but still returns valid results
      const allPages = json?.ParsedResults ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasResults = allPages.length > 0 && allPages.some((p: any) => p?.ParsedText);
      
      // Check if this is a page limit warning (has results despite error flag)
      const isPageLimitWarning = json?.IsErroredOnProcessing && 
        hasResults &&
        json?.ErrorMessage?.some((msg: unknown) => String(msg).includes('maximum page limit'));
      
      if (!resp.ok || (json?.IsErroredOnProcessing && !isPageLimitWarning)) {
        console.warn("/api/ocr:ocrspace_response_err", { status: resp.status, ms: Date.now() - attemptStart, detail: json });
        return { ok: false as const, json };
      }
      
      // Extract text from up to 3 pages and concatenate
      const pages = allPages.slice(0, 3);
      const totalPageCount = allPages.length;
      const hasMorePages = isPageLimitWarning || totalPageCount > 3;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedText = pages.map((p: any) => p?.ParsedText ?? "").join("\n\n");
      const confidence = Number(json?.OCRExitCode === 1 ? 0.8 : 0.5);
      console.log("/api/ocr:ocrspace_ok", { textLen: parsedText?.length || 0, conf: confidence, pages: pages.length, totalPages: totalPageCount, isPageLimitWarning, ms: Date.now() - attemptStart });
      return { ok: true as const, text: parsedText, confidence, totalPageCount, hasMorePages };
    } catch (err) {
      console.warn("/api/ocr:ocrspace_fetch_err", String(err));
      return { ok: false as const, json: { error: String(err) } };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function callOcrSpaceFile(fileBuffer: Buffer, mimeType: string, filename: string, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const form = new FormData();
      form.set("apikey", env.OCRSPACE_API_KEY as string);
      form.set("language", "eng");
      form.set("isOverlayRequired", "false");
      // Convert Node Buffer to a standalone ArrayBuffer to satisfy BlobPart typing
      const ab = new ArrayBuffer(fileBuffer.byteLength);
      new Uint8Array(ab).set(fileBuffer);
      const file = new File([ab], filename, { type: mimeType });
      form.set("file", file);
      const attemptStart = Date.now();
      const resp = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const json = await resp.json();
      
      // Check if we have parsed results even if IsErroredOnProcessing is true
      // OCR.space sets IsErroredOnProcessing=true for page limit warnings but still returns valid results
      const allPages = json?.ParsedResults ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasResults = allPages.length > 0 && allPages.some((p: any) => p?.ParsedText);
      
      // Check if this is a page limit warning (has results despite error flag)
      const isPageLimitWarning = json?.IsErroredOnProcessing && 
        hasResults &&
        json?.ErrorMessage?.some((msg: unknown) => String(msg).includes('maximum page limit'));
      
      if (!resp.ok || (json?.IsErroredOnProcessing && !isPageLimitWarning)) {
        console.warn("/api/ocr:ocrspace_response_err", { status: resp.status, ms: Date.now() - attemptStart, detail: json });
        return { ok: false as const, json };
      }
      
      // Extract text from up to 3 pages and concatenate
      const pages = allPages.slice(0, 3);
      const totalPageCount = allPages.length;
      const hasMorePages = isPageLimitWarning || totalPageCount > 3;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsedText = pages.map((p: any) => p?.ParsedText ?? "").join("\n\n");
      const confidence = Number(json?.OCRExitCode === 1 ? 0.8 : 0.5);
      console.log("/api/ocr:ocrspace_ok", { textLen: parsedText?.length || 0, conf: confidence, pages: pages.length, totalPages: totalPageCount, isPageLimitWarning, ms: Date.now() - attemptStart });
      return { ok: true as const, text: parsedText, confidence, totalPageCount, hasMorePages };
    } catch (err) {
      console.warn("/api/ocr:ocrspace_fetch_err", String(err));
      return { ok: false as const, json: { error: String(err) } };
    } finally {
      clearTimeout(timeout);
    }
  }

  const b64Processed = processed.toString("base64");
  // Increase timeouts to reduce AbortError rate from OCR.space under load
  const t1 = isPdf ? 120000 : 60000;
  const t2 = isPdf ? 180000 : 120000;
  let result: { ok: true; text: string; confidence: number; totalPageCount?: number; hasMorePages?: boolean } | { ok: false; json: unknown };
  if (isPdf) {
    console.log("/api/ocr:attempt_1", { processed: false, mime: "application/pdf", timeoutMs: t1 });
    result = await callOcrSpaceFile(imgBuf, "application/pdf", `${submissionId}.pdf`, t1);
  } else {
    const dataUriProcessed = `data:image/png;base64,${b64Processed}`;
    console.log("/api/ocr:attempt_1", { processed: true, mime: "image/png", timeoutMs: t1 });
    result = await callOcrSpace(dataUriProcessed, t1);
  }
  if (!result.ok) {
    // Retry once with original (non-processed) image and a longer timeout.
    // For images, switch to multipart file upload on retry (more reliable than base64 under load).
    console.warn("/api/ocr:attempt_1_failed", result.json);
    console.log("/api/ocr:attempt_2", { processed: false, mime, timeoutMs: t2 });
    if (isPdf) {
      result = await callOcrSpaceFile(imgBuf, "application/pdf", `${submissionId}.pdf`, t2);
    } else {
      const filename = `${submissionId}.${mime === "image/png" ? "png" : "jpg"}`;
      result = await callOcrSpaceFile(imgBuf, mime, filename, t2);
    }
  }
  if (!result.ok) {
    return NextResponse.json({ error: "ocrspace_failed", detail: result.json || null }, { status: 502 });
  }
  text = result.text;
  conf = result.confidence;
  const totalPageCount = result.totalPageCount;
  const hasMorePages = result.hasMorePages;
  console.log("/api/ocr:success", { textLen: text.length, conf, totalPageCount, hasMorePages });

  const ocrMs = Date.now() - start;

  // Duplicate detection before updating DB and triggering pipelines
  try {
    const dup = await findDuplicateCase(text || "");
    if (dup.match && dup.caseId) {
      await supabase.from("submissions").delete().eq("id", submissionId);
      return NextResponse.json({
        duplicate: true,
        match: dup.match,
        caseId: dup.caseId,
        url: `/cases/${dup.caseId}`,
        similarity: { distance: dup.distance ?? 0 }
      }, { status: 409 });
    }
  } catch (e) {
    console.warn("/api/ocr:dedupe_failed", String(e));
  }

  const fields = buildDedupeFields(text || "");
  const { error: updateError } = await supabase
    .from("submissions")
    .update({
      raw_text: text,
      ocr_method: ocrMethod,
      ocr_confidence: conf,
      ocr_ms: ocrMs,
      processing_status: "ocr",
      normalized_text: fields.normalized_text,
      normalized_hash: fields.normalized_hash,
      simhash64: fields.simhash64,
    })
    .eq("id", submissionId);
  if (updateError) {
    console.error("/api/ocr:db_update_failed", { submissionId, error: updateError });
    return NextResponse.json({ error: "db_update_failed", detail: updateError.message }, { status: 500 });
  }
  console.log("/api/ocr:db_update_ok", { submissionId, ocrMs });

  // Screenshot type detection (only for manual uploads with message_type = "unknown")
  try {
    const { data: currentSubmission } = await supabase
      .from("submissions")
      .select("message_type")
      .eq("id", submissionId)
      .single();
    
    const currentMessageType = currentSubmission?.message_type;
    
    // Only run detection if message_type is "unknown" (i.e., manual upload)
    if (currentMessageType === "unknown" && !isPdf) {
      const detectionStart = Date.now();
      
      // Prepare a downscaled image data URL for the AI vision model
      let imageDataUrl: string | null = null;
      try {
        // Create a small thumbnail for vision model (to reduce tokens)
        const thumbnail = await sharp(processed)
          .resize({ width: 800, withoutEnlargement: true })
          .toFormat("jpeg", { quality: 70 })
          .toBuffer();
        const thumbBase64 = thumbnail.toString("base64");
        imageDataUrl = `data:image/jpeg;base64,${thumbBase64}`;
      } catch (thumbError) {
        console.warn("/api/ocr:type_detection:thumbnail_failed", String(thumbError));
        // Skip type detection if we can't create thumbnail
      }
      
      if (imageDataUrl) {
        const result = await detectScreenshotType(imageDataUrl); // No timeout - GPT-5 can be slow
        const detectionMs = Date.now() - detectionStart;
        
        console.log("/api/ocr:type_detected", {
          submissionId,
          type: result.type,
          confidence: result.confidence,
          usedModel: result.usedModel,
          ms: detectionMs,
        });
        
        // Update message_type if confident and type is SMS or Email
        if (result.confidence >= 0.7 && (result.type === "sms" || result.type === "email")) {
          const { error: typeUpdateError } = await supabase
            .from("submissions")
            .update({ message_type: result.type })
            .eq("id", submissionId);
          
          if (typeUpdateError) {
            console.warn("/api/ocr:type_update_failed", { submissionId, error: typeUpdateError });
          } else {
            console.log("/api/ocr:type_updated", { submissionId, newType: result.type });
          }
        }
      }
    }
  } catch (typeDetectionError) {
    // Log but don't fail the OCR pipeline
    console.warn("/api/ocr:type_detection_error", { submissionId, error: String(typeDetectionError) });
  }

  // Fire-and-forget classify (absolute URL). Log failures.
  try {
    const base = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const classifyUrl = `${base}/api/classify`;
    const senderUrl = `${base}/api/sender`;
    void fetch(classifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
      body: JSON.stringify({ submissionId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("/api/ocr classify trigger failed", res.status, text);
        }
      })
      .catch((err) => {
        console.error("/api/ocr classify trigger error", err);
      });

    void fetch(senderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
      body: JSON.stringify({ submissionId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("/api/ocr sender trigger failed", res.status, text);
        }
      })
      .catch((err) => {
        console.error("/api/ocr sender trigger error", err);
      });
  } catch (err) {
    console.error("/api/ocr classify trigger setup error", err);
  }

  const response: {
    ok: boolean;
    rawText: string;
    conf: number;
    ms: number;
    warning?: string;
    totalPageCount?: number;
  } = {
    ok: true,
    rawText: text,
    conf,
    ms: ocrMs,
  };

  // Add warning if PDF has more than 3 pages
  if (hasMorePages && totalPageCount) {
    response.warning = "page_limit";
    response.totalPageCount = totalPageCount;
    console.log("/api/ocr:page_limit_warning", { totalPageCount, processedPages: 3 });
  }

  return NextResponse.json(response);
}
