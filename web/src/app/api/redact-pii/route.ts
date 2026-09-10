import { NextRequest, NextResponse } from "next/server";
import { requireInternalSecret } from "@/lib/internal-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import { detectPII } from "@/server/ai/redact-pii";

/**
 * Redact PII from submission text fields.
 * Runs as a separate step after classification/sender extraction.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalSecret(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { submissionId } = body;

    if (!submissionId || typeof submissionId !== "string") {
      return NextResponse.json(
        { error: "submissionId required" },
        { status: 400 }
      );
    }

    console.log("redact-pii:start", { submissionId });

    const supabase = getSupabaseServer();

    // Load submission data
    const { data: items, error: fetchError } = await supabase
      .from("submissions")
      .select("id, raw_text, email_body, email_subject, email_from")
      .eq("id", submissionId)
      .limit(1);

    if (fetchError || !items?.[0]) {
      console.error("redact-pii:not_found", { submissionId, error: fetchError });
      return NextResponse.json(
        { error: "submission not found" },
        { status: 404 }
      );
    }

    const submission = items[0] as {
      id: string;
      raw_text?: string | null;
      email_body?: string | null;
      email_subject?: string | null;
      email_from?: string | null;
    };

    // Detect PII using AI
    const piiResult = await detectPII(
      submission.raw_text || "",
      submission.email_from
    );

    console.log("redact-pii:detected", {
      submissionId,
      stringsFound: piiResult.strings_to_redact.length,
      confidence: piiResult.confidence,
    });

    // If no PII detected or low confidence, skip redaction
    if (piiResult.strings_to_redact.length === 0 || piiResult.confidence < 0.5) {
      console.log("redact-pii:skipped", {
        submissionId,
        reason: "no_pii_or_low_confidence",
        confidence: piiResult.confidence,
      });
      return NextResponse.json({
        ok: true,
        redacted: false,
        reason: "no_pii_detected",
        confidence: piiResult.confidence,
      });
    }

    // Perform redaction on text fields - iterate over all strings to redact
    const updates: Record<string, string | null> = {};

    // Helper function to redact all PII strings from text
    // Also redacts punctuation-stripped versions (e.g., "Ryan," → also redact "Ryan")
    const redactText = (text: string): string => {
      let redacted = text;
      const stringsToRedact = new Set<string>();
      
      // Collect all strings to redact, including punctuation-stripped versions
      for (const piiString of piiResult.strings_to_redact) {
        stringsToRedact.add(piiString);
        
        // Also add version without trailing punctuation
        const withoutPunctuation = piiString.replace(/[.,;:!?]+$/, "");
        if (withoutPunctuation !== piiString && withoutPunctuation.length > 0) {
          stringsToRedact.add(withoutPunctuation);
        }
      }
      
      // Sort by length descending to redact longer strings first (avoid partial matches)
      const sortedStrings = Array.from(stringsToRedact).sort((a, b) => b.length - a.length);
      
      for (const piiString of sortedStrings) {
        const asterisks = "*".repeat(piiString.length);
        redacted = redacted.split(piiString).join(asterisks);
      }
      return redacted;
    };

    if (submission.raw_text) {
      updates.raw_text = redactText(submission.raw_text);
    }

    if (submission.email_body) {
      updates.email_body = redactText(submission.email_body);
    }

    if (submission.email_subject) {
      updates.email_subject = redactText(submission.email_subject);
    }

    // Update database with redacted text
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("submissions")
        .update(updates)
        .eq("id", submissionId);

      if (updateError) {
        console.error("redact-pii:update_failed", {
          submissionId,
          error: updateError,
        });
        return NextResponse.json(
          { error: "database update failed" },
          { status: 500 }
        );
      }

      console.log("redact-pii:success", {
        submissionId,
        fieldsUpdated: Object.keys(updates),
        stringsRedacted: piiResult.strings_to_redact,
      });

      return NextResponse.json({
        ok: true,
        redacted: true,
        fieldsUpdated: Object.keys(updates),
        confidence: piiResult.confidence,
      });
    }

    console.log("redact-pii:no_updates", { submissionId });
    return NextResponse.json({
      ok: true,
      redacted: false,
      reason: "no_text_fields",
    });
  } catch (error) {
    console.error("redact-pii:error", { error: String(error) });
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}

