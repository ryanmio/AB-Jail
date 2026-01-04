import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { ingestTextSubmission, triggerPipelines } from "@/server/ingest/save";
import { cleanTextForAI } from "@/server/ingest/text-cleaner";
import { sanitizeEmailHtml } from "@/server/ingest/html-sanitizer";
import { env } from "@/lib/env";

// Mailgun sends POST with application/x-www-form-urlencoded by default
export async function POST(req: NextRequest) {
  try {
    console.log("/api/inbound-email:start", {
      ct: req.headers.get("content-type") || null,
    });
    
    const contentType = req.headers.get("content-type") || "";
    let sender = "";
    let subject = "";
    let bodyPlain = "";
    let bodyHtml = "";
    let messageHeaders = ""; // Mailgun provides original email headers as JSON array

    // Parse Mailgun webhook payload
    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Read raw body as UTF-8 and manually parse to ensure proper encoding
      const rawBody = await req.text();
      const params = new URLSearchParams(rawBody);
      sender = params.get("sender") || params.get("from") || params.get("From") || "";
      subject = params.get("subject") || params.get("Subject") || "";
      bodyPlain = params.get("body-plain") || params.get("stripped-text") || params.get("text") || "";
      bodyHtml = params.get("body-html") || params.get("stripped-html") || params.get("html") || "";
      messageHeaders = params.get("message-headers") || "";
    } else if (contentType.includes("multipart/form-data")) {
      // Use formData for multipart (handles binary attachments correctly)
      const form = await req.formData();
      sender = String(form.get("sender") || form.get("from") || form.get("From") || "");
      subject = String(form.get("subject") || form.get("Subject") || "");
      bodyPlain = String(form.get("body-plain") || form.get("stripped-text") || form.get("text") || "");
      bodyHtml = String(form.get("body-html") || form.get("stripped-html") || form.get("html") || "");
      messageHeaders = String(form.get("message-headers") || "");
    } else if (contentType.includes("application/json")) {
      const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      sender = String(json?.sender || json?.from || json?.From || "");
      subject = String(json?.subject || json?.Subject || "");
      bodyPlain = String(json?.["body-plain"] || json?.["stripped-text"] || json?.text || "");
      bodyHtml = String(json?.["body-html"] || json?.["stripped-html"] || json?.html || "");
      messageHeaders = String(json?.["message-headers"] || "");
    } else {
      // Best-effort: try reading as text and parsing as URLSearchParams
      const rawBody = await req.text();
      const params = new URLSearchParams(rawBody);
      sender = params.get("sender") || params.get("from") || params.get("From") || "";
      subject = params.get("subject") || params.get("Subject") || "";
      bodyPlain = params.get("body-plain") || params.get("stripped-text") || params.get("text") || "";
      bodyHtml = params.get("body-html") || params.get("stripped-html") || params.get("html") || "";
      messageHeaders = params.get("message-headers") || "";
    }

    // Store envelope sender (forwarder's email) for reply feature
    const envelopeSender = sender;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("/api/inbound-email:error service_key_missing");
      return NextResponse.json({ error: "service_key_missing" }, { status: 400 });
    }

    // Use plain text for classification, HTML for display
    let rawText = bodyPlain || stripHtml(bodyHtml);

    // Determine if this appears to be a forwarded email
    const isForwarded = detectForwardedEmail(subject || "", rawText, bodyHtml || "");

    // IMPORTANT: Extract original From line BEFORE stripping forwarded headers
    // Try from body-plain first; if missing, try from stripped HTML
    let originalFromLine = extractOriginalFromLine(rawText);
    if (!originalFromLine && bodyHtml) {
      const htmlAsText = stripHtml(bodyHtml);
      originalFromLine = extractOriginalFromLine(htmlAsText);
    }

    // Fallback: Only if NOT a forwarded email, use the envelope sender
    // For forwarded emails, we must not set email_from to the forwarder's address
    if (!originalFromLine && sender && !isForwarded) {
      originalFromLine = sender;
    }
    
    // Strip only the forwarded separator line(s), keep From/Date/Subject/To metadata intact
    // We remove the visual divider but preserve the subsequent headers for AI and storage
    rawText = rawText
      .replace(/^[\s>]*-+\s*Forwarded message\s*-+\s*(?:\r?\n)+/im, "")
      .replace(/^[\s>]*-+\s*Forwarded message\s*-+\s*$/gim, "");
    
    // Redact honeytrap email addresses and unique tracking IDs from environment variables
    const honeytrapEmails = env.HONEYTRAP_EMAILS 
      ? env.HONEYTRAP_EMAILS.split(',').map(e => e.trim()).filter(e => e.length > 0)
      : [];
    
    const honeytrapIds = env.HONEYTRAP_IDS
      ? env.HONEYTRAP_IDS.split(',').map(e => e.trim()).filter(e => e.length > 0)
      : [];
    
    if (honeytrapEmails.length === 0 && honeytrapIds.length === 0) {
      console.warn("/api/inbound-email:warning HONEYTRAP_EMAILS/IDS not configured - skipping honeytrap redaction");
    }
    
    const redactHoneytrap = (text: string) => {
      let result = text;
      
      // Redact email addresses
      for (const email of honeytrapEmails) {
        const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'gi'), '*******@*******.com');
      }
      
      // Redact tracking IDs
      for (const id of honeytrapIds) {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'gi'), '########');
      }
      
      return result;
    };
    
    rawText = redactHoneytrap(rawText);
    subject = redactHoneytrap(subject);
    
    // Clean text for AI (removes tracking links, invisible chars, excessive whitespace)
    // Note: cleanTextForAI also strips forwarded message headers
    const cleanedText = cleanTextForAI(rawText);
    
    // IMPORTANT: Keep original HTML for URL extraction (before sanitization removes tracking links)
    const originalHtml = bodyHtml;
    
    // Log HTML extraction metrics for debugging
    if (originalHtml) {
      const hrefPattern = /href=["']([^"']+)["']/gi;
      const hrefMatches = Array.from(originalHtml.matchAll(hrefPattern));
      console.log("/api/inbound-email:html_extraction", {
        originalHtmlLength: originalHtml.length,
        hrefCount: hrefMatches.length,
        sampleHrefs: hrefMatches.slice(0, 5).map(m => m[1])
      });
    }
    
    // Sanitize HTML body (remove non-ActBlue links to protect honeytrap email)
    let sanitizedHtml = bodyHtml ? sanitizeEmailHtml(bodyHtml) : null;
    
    // Also strip forwarded header and redact honeytrap from HTML
    if (sanitizedHtml) {
      sanitizedHtml = sanitizedHtml
        .replace(/^[\s>]*-+\s*Forwarded message\s*-+\s*(?:<br\s*\/?\s*>|\r?\n)+/im, "")
        .replace(/^[\s>]*-+\s*Forwarded message\s*-+\s*(?:<br\s*\/?\s*>)?$/gim, "");
      sanitizedHtml = redactHoneytrap(sanitizedHtml);
    }
    
    // Attempt to detect original sender email (for sender_id): prefer parsed from originalFromLine, then from body, else envelope
    const detectedSender =
      parseEmailAddress(originalFromLine || undefined) ||
      extractOriginalSender(rawText) ||
      parseEmailAddress(sender) ||
      sender;

    // Extract original email send date (from Mailgun headers or forwarded body)
    const originalEmailDate = extractOriginalEmailDate(messageHeaders, rawText, bodyHtml || "");
    if (originalEmailDate) {
      console.log("/api/inbound-email:extracted_email_date", {
        emailSentAt: originalEmailDate.toISOString(),
        source: messageHeaders ? "mailgun_headers" : "forwarded_body"
      });
    }

    // Generate secure token for one-time report submission via email
    const submissionToken = randomBytes(32).toString("base64url");

    // Determine forwarder email: exclude honeytrap bot emails to mark them as bot-captured
    let forwarderEmail: string | null = null;
    if (isForwarded) {
      const parsedEnvelope = parseEmailAddress(envelopeSender) || envelopeSender || null;
      if (parsedEnvelope) {
        const isHoneytrapForwarder = honeytrapEmails.some(email => 
          parsedEnvelope.toLowerCase().includes(email.toLowerCase())
        );
        // Only set forwarderEmail if NOT from a honeytrap - this keeps bot emails marked as bot-captured
        if (!isHoneytrapForwarder) {
          forwarderEmail = parsedEnvelope;
        }
      }
    }

    // Insert into Supabase (with duplicate detection inside ingestTextSubmission)
    // Use cleaned text for heuristics and AI, but store raw text for reference
    const result = await ingestTextSubmission({
      text: cleanedText || "",
      rawText: rawText || "", // Store original for audit
      senderId: detectedSender || null,
      messageType: "email",
      imageUrlPlaceholder: "email://no-image",
      emailSubject: subject || null,
      emailBody: sanitizedHtml || null, // Sanitized HTML (no tracking/unsubscribe links) for display
      emailBodyOriginal: originalHtml || null, // Original HTML for URL extraction
      emailFrom: originalFromLine || null, // Full original "From:" line (prefer original content; not the forwarder)
      forwarderEmail: forwarderEmail, // Only set if forwarded by a real user (not a honeytrap bot)
      submissionToken: submissionToken, // Secure token for email submission
      emailSentAt: originalEmailDate || null, // Original email send date (if extractable)
    });
    
    console.log("/api/inbound-email:ingested", {
      ok: result.ok,
      id: result.id || null,
      from: detectedSender || null,
      fromLine: originalFromLine || null,
      subject: subject ? subject.slice(0, 50) : null,
      rawLen: rawText ? rawText.length : 0,
      cleanedLen: cleanedText ? cleanedText.length : 0,
      isFundraising: result.isFundraising ?? null,
      heuristic: result.heuristic || null,
    });
    
    if (!result.ok) {
      if (result.error === "duplicate") {
        console.log("/api/inbound-email:duplicate", { 
          existingId: result.id || null, 
          from: detectedSender || null 
        });
        return NextResponse.json({ ok: true, duplicate: true, id: result.id }, { status: 200 });
      }
      if (!result.id) {
        console.error("/api/inbound-email:ingest_failed", result);
        return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
      }
    }

    // For fundraising, trigger async pipelines (classify + sender extraction)
    if (result.isFundraising && result.id) {
      console.log("/api/inbound-email:triggering_pipelines", { 
        submissionId: result.id,
        hasLandingUrl: !!result.landingUrl,
        timestamp: new Date().toISOString()
      });
      
      // Always trigger classify and sender immediately
      const pipelinesStart = Date.now();
      await triggerPipelines(result.id);
      const pipelinesElapsed = Date.now() - pipelinesStart;
      console.log("/api/inbound-email:pipelines_completed", { 
        submissionId: result.id,
        elapsedMs: pipelinesElapsed
      });
      
      // If ActBlue landing URL detected, trigger screenshot (which will re-classify with landing context)
      if (result.landingUrl) {
        const base = process.env.NEXT_PUBLIC_SITE_URL || "";
        console.log("/api/inbound-email:triggering_screenshot", {
          submissionId: result.id,
          url: result.landingUrl
        });
        void fetch(`${base}/api/screenshot-actblue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: result.id, url: result.landingUrl }),
        }).then(async (r) => {
          const text = await r.text().catch(() => "");
          console.log("/api/inbound-email:screenshot_triggered", { 
            status: r.status, 
            caseId: result.id,
            url: result.landingUrl,
            response: text?.slice(0, 200) 
          });
        }).catch((e) => {
          console.error("/api/inbound-email:screenshot_error", { 
            submissionId: result.id,
            error: String(e)
          });
        });
      }
    } else {
      console.log("/api/inbound-email:skipped_triggers_non_fundraising", { 
        submissionId: result.id,
        isFundraising: result.isFundraising
      });
      
      // Send notice email to forwarder for non-fundraising submissions
      if (result.id && isForwarded && envelopeSender) {
        console.log("/api/inbound-email:triggering_non_fundraising_notice", {
          submissionId: result.id,
          forwarder: parseEmailAddress(envelopeSender) || envelopeSender
        });
        
        const base = process.env.NEXT_PUBLIC_SITE_URL || "";
        // Await to ensure completion in serverless environment
        await fetch(`${base}/api/send-non-fundraising-notice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId: result.id }),
        }).then(async (r) => {
          const text = await r.text().catch(() => "");
          console.log("/api/inbound-email:non_fundraising_notice_triggered", { 
            status: r.status, 
            submissionId: result.id,
            response: text?.slice(0, 200) 
          });
        }).catch((e) => {
          console.error("/api/inbound-email:non_fundraising_notice_error", { 
            submissionId: result.id,
            error: String(e)
          });
        });
      }
    }

    return NextResponse.json({ ok: true, id: result.id }, { status: 200 });
  } catch (e) {
    console.error("/api/inbound-email:exception", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// Strip HTML tags to get plain text
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Detect if an email appears to be a forward based on subject/body/html markers
function detectForwardedEmail(subject: string, bodyText: string, bodyHtml: string): boolean {
  const subj = subject.toLowerCase();
  if (subj.startsWith("fwd:") || subj.includes("fw:")) return true;
  const textHasForward = /forwarded message|begin forwarded message/i.test(bodyText);
  const htmlHasForward = /forwarded message|begin forwarded message/i.test(bodyHtml);
  return textHasForward || htmlHasForward;
}

// Attempt to extract original sender email from forwarded email body
// Returns just the email address for sender_id
function extractOriginalSender(text: string): string | null {
  const lines = text.split("\n");
  for (const line of lines.slice(0, 50)) { // Check first 50 lines
    // Match patterns like:
    // From: sender@example.com
    // From: "Name" <sender@example.com>
    const match = line.match(/^From:\s*(?:"[^"]*"\s*)?<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Extract the full original "From:" line from forwarded email (for AB009 detection)
// Returns the complete From line including display name
// Example: "NEW ActBlue Update (via dccc@dccc.org) <dccc@ak.dccc.org>"
function extractOriginalFromLine(text: string): string | null {
  const lines = text.split(/\r?\n/).map(line => line.replace(/^[\s>]+/, "")); // Normalize: strip quotes/whitespace
  
  // Find forwarded message boundary (Gmail, Apple Mail, Outlook all use similar patterns)
  const forwardMarkers = [
    /^-+\s*Forwarded message\s*-+/i,     // Gmail: "---------- Forwarded message ---------"
    /^Begin forwarded message:/i,         // Apple Mail
    /^From:\s+.+@.+/i                     // Outlook (starts with From: line directly)
  ];
  
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const isForwardBoundary = forwardMarkers.some(marker => marker.test(lines[i]));
    
    if (isForwardBoundary) {
      // Search next 20 lines for From: header
      const searchEnd = Math.min(i + 20, lines.length);
      for (let j = i; j < searchEnd; j++) {
        const match = lines[j].match(/^From:\s+(.+)$/i);
        if (match) {
          return validateAndCleanFromLine(match[1]);
        }
        // Stop at empty line (end of header block)
        if (lines[j].trim() === "" && j > i) break;
      }
    }
  }
  
  return null;
}

// Validate and clean extracted From line
function validateAndCleanFromLine(fromLine: string): string | null {
  const cleaned = fromLine.trim();
  
  // Must be valid: has email, reasonable length, not a honeytrap email
  if (!cleaned.includes("@") || cleaned.length <= 5) {
    return null;
  }
  
  // Check if this is a honeytrap email
  const honeytrapEmails = env.HONEYTRAP_EMAILS 
    ? env.HONEYTRAP_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0)
    : [];
  
  const isHoneytrap = honeytrapEmails.some(email => cleaned.toLowerCase().includes(email));
  
  if (isHoneytrap) {
    return null;
  }
  
  return cleaned;
}

// Parse a bare email address from formats like:
// - Name <email@example.com>
// - "Name" <email@example.com>
// - email@example.com
function parseEmailAddress(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return m ? m[1] : null;
}

// Extract original Date: or Sent: line from forwarded email body text or HTML
// Looks for Date: or Sent: after forward markers like "---------- Forwarded message ---------"
// Different email clients use different header names (Gmail uses "Date:", Yahoo uses "Sent:")
function extractOriginalDateFromBody(text: string): Date | null {
  // Normalize HTML: convert <br> tags to newlines, strip other tags
  const normalized = text
    .replace(/<br\s*\/?>/gi, "\n")  // <br> and <br/> to newlines
    .replace(/<[^>]+>/g, " ")        // Strip other HTML tags
    .replace(/&lt;/g, "<")           // Decode HTML entities
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
  
  const lines = normalized.split(/\r?\n/).map(line => line.replace(/^[\s>]+/, "").trim());
  
  // Find forwarded message boundary
  const forwardMarkers = [
    /^-+\s*Forwarded message\s*-+/i,     // Gmail: "---------- Forwarded message ---------"
    /^Begin forwarded message:/i,         // Apple Mail
    /^From:\s+.+@.+/i                     // Outlook (starts with From: line directly)
  ];
  
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const isForwardBoundary = forwardMarkers.some(marker => marker.test(lines[i]));
    
    if (isForwardBoundary) {
      // Search next 20 lines for Date: or Sent: header (different email clients use different formats)
      const searchEnd = Math.min(i + 20, lines.length);
      for (let j = i; j < searchEnd; j++) {
        const match = lines[j].match(/^(?:Date|Sent):\s*(.+)$/i);
        if (match && match[1]) {
          const dateStr = match[1].trim();
          const parsed = parseEmailDateString(dateStr);
          if (parsed && isValidEmailDate(parsed)) {
            return parsed;
          }
        }
        // Stop at empty line (end of header block) but only after finding some content
        if (lines[j].trim() === "" && j > i + 1) break;
      }
    }
  }
  
  return null;
}

// Parse various email date formats
// Examples:
// - "Sat, Dec 27, 2025 at 8:33 PM" (Gmail style)
// - "Thu, 1 Jan 2026 10:30:00 -0500" (RFC 2822)
// - "December 27, 2025 at 8:33 PM"
function parseEmailDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // First, try standard Date parsing
  let parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Gmail uses "at" between date and time: "Sat, Dec 27, 2025 at 8:33 PM"
  // Remove "at" and try again
  const withoutAt = dateStr.replace(/\s+at\s+/i, " ");
  parsed = new Date(withoutAt);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // Try extracting just the date portion for more complex formats
  // Match patterns like "Dec 27, 2025" or "December 27, 2025"
  const dateOnlyMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (dateOnlyMatch) {
    const [, month, day, year] = dateOnlyMatch;
    // Extract time if present (e.g., "8:33 PM" or "20:33")
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    let hours = 0, minutes = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[4];
      if (ampm) {
        if (ampm.toUpperCase() === "PM" && hours !== 12) hours += 12;
        if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;
      }
    }
    parsed = new Date(`${month} ${day}, ${year} ${hours}:${minutes.toString().padStart(2, "0")}`);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
}

// Validate that a parsed date is reasonable for an email:
// - Not NaN (invalid date)
// - Not more than 24 hours in the future (clock skew tolerance)
// - Not more than 1 year in the past (reasonable limit for forwarded emails)
function isValidEmailDate(date: Date): boolean {
  if (isNaN(date.getTime())) return false;
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const oneDayAhead = now + 24 * 60 * 60 * 1000;
  return date.getTime() >= oneYearAgo && date.getTime() <= oneDayAhead;
}

// Extract original email send date from forwarded email body
// Note: Mailgun's message-headers contain the FORWARDED email's date (when user forwarded to us),
// NOT the original email's date. So we must extract from the forwarded body content.
function extractOriginalEmailDate(
  _messageHeaders: string, // Not used - contains wrong date (forward date, not original)
  bodyText: string,
  bodyHtml: string
): Date | null {
  // Try plain text body first
  let emailDate = extractOriginalDateFromBody(bodyText);
  if (emailDate) {
    return emailDate;
  }
  
  // Try HTML body (the function handles HTML normalization internally)
  if (bodyHtml) {
    emailDate = extractOriginalDateFromBody(bodyHtml);
    if (emailDate) {
      return emailDate;
    }
  }
  
  return null;
}

