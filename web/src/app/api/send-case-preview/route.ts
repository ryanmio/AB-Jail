import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { getSupabaseServer } from "@/lib/supabase-server";

function parseSupabaseUrl(u: string | null | undefined) {
  if (!u || !u.startsWith("supabase://")) return null;
  const rest = u.replace("supabase://", "");
  const [bucket, ...pathParts] = rest.split("/");
  const path = pathParts.join("/");
  return { bucket, path };
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log("/api/send-case-preview:start", { timestamp: new Date().toISOString() });
  
  if (!env.RESEND_API_KEY) {
    console.error("/api/send-case-preview:error resend_key_missing");
    return NextResponse.json({ error: "resend_key_missing" }, { status: 400 });
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const supabase = getSupabaseServer();

  const body = await req.json().catch(() => null);
  const submissionId: string | undefined = body?.submissionId;
  
  console.log("/api/send-case-preview:parsed_body", { submissionId, hasBody: !!body });
  
  if (!submissionId) {
    console.error("/api/send-case-preview:error missing_args", { body });
    return NextResponse.json({ error: "missing_args" }, { status: 400 });
  }

  // Fetch submission data
  console.log("/api/send-case-preview:fetching_submission", { submissionId });
  const { data: rows, error: err } = await supabase
    .from("submissions")
    .select("id, sender_name, sender_id, forwarder_email, submission_token, preview_email_sent_at, image_url, landing_url, message_type, email_body")
    .eq("id", submissionId)
    .limit(1);

  if (err) {
    console.error("/api/send-case-preview:error load_failed", { submissionId, error: err });
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const sub = rows?.[0] as
    | { id: string; sender_name?: string | null; sender_id?: string | null; forwarder_email?: string | null; submission_token?: string | null; preview_email_sent_at?: string | null; image_url?: string | null; landing_url?: string | null; message_type?: string | null; email_body?: string | null }
    | undefined;

  console.log("/api/send-case-preview:submission_loaded", { 
    submissionId, 
    found: !!sub, 
    hasForwarderEmail: !!sub?.forwarder_email,
    alreadySent: !!sub?.preview_email_sent_at,
    messageType: sub?.message_type 
  });

  if (!sub) {
    console.error("/api/send-case-preview:error not_found", { submissionId });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Skip if no forwarder email (screenshot/paste submissions)
  if (!sub.forwarder_email) {
    console.log("/api/send-case-preview:skip no_forwarder_email", { submissionId });
    return NextResponse.json({ ok: true, skipped: "no_forwarder_email" }, { status: 200 });
  }

  // Skip if already sent (prevent duplicates on re-classification)
  if (sub.preview_email_sent_at) {
    console.log("/api/send-case-preview:skip already_sent", { submissionId, sentAt: sub.preview_email_sent_at });
    return NextResponse.json({ ok: true, skipped: "already_sent" }, { status: 200 });
  }

  // Load violations
  console.log("/api/send-case-preview:loading_violations", { submissionId });
  const { data: vioRows } = await supabase
    .from("violations")
    .select("code, title, description, actblue_verified")
    .eq("submission_id", sub.id)
    .order("severity", { ascending: false });

  const allViolations = Array.isArray(vioRows) ? vioRows : [];
  const filteredViolations = allViolations.filter(
    (v) => !(v.code === "AB008" && v.actblue_verified === true)
  );
  const removedVerifiedAb008 = allViolations.length - filteredViolations.length;
  const violations = filteredViolations;
  console.log("/api/send-case-preview:violations_loaded", { submissionId, count: violations.length });

  // Get campaign name
  const campaign = sub.sender_name || sub.sender_id || "(unknown sender)";

  // Determine evidence type: Email HTML vs Screenshot
  const isEmailSubmission = sub.message_type === 'email' && sub.email_body;
  let evidenceUrl: string | null = null;
  let evidenceLabel = "Screenshot";
  let evidenceLinkText = "View Screenshot";

  if (isEmailSubmission) {
    // Email submission: link to email HTML viewer
    evidenceUrl = `${env.NEXT_PUBLIC_SITE_URL}/api/cases/${sub.id}/email-html`;
    evidenceLabel = "Email HTML";
    evidenceLinkText = "The email I received is linked here";
  } else {
    // Screenshot/paste submission: get screenshot URL
    let screenshotUrl: string | null = sub.image_url || null;
    if (screenshotUrl && !screenshotUrl.startsWith("http")) {
      const parsed = parseSupabaseUrl(screenshotUrl);
      if (parsed) {
        try {
          const { data: signed } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 86400); // 24h expiry
          screenshotUrl = signed?.signedUrl || screenshotUrl;
        } catch {
          screenshotUrl = null;
        }
      }
    }
    evidenceUrl = screenshotUrl;
  }

  // Build email content
  const shortId = sub.id.split("-")[0];
  const caseUrl = `${env.NEXT_PUBLIC_SITE_URL}/cases/${sub.id}`;
  const submitUrl = `${env.NEXT_PUBLIC_SITE_URL}/api/submit-report-via-email?token=${encodeURIComponent(sub.submission_token || "")}`;

  // Format violations as HTML
  const esc = (s: string) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const vioHtml = violations.length > 0
    ? `<ul style="margin:0;padding-left:20px">${violations.map((v) => `<li style="margin:4px 0"><strong>${esc(v.code)}</strong> ${esc(v.title)}${v.description ? `: ${esc(v.description)}` : ""}</li>`).join("")}</ul>`
    : `<p style="margin:0;color:#64748b">(No violations detected)</p>`;
  const exemptNoticeHtml = removedVerifiedAb008 > 0
    ? `<p style="margin:8px 0 0 0;color:#1e3a8a;font-size:13px;background:#e0e7ff;border:1px solid #c7d2fe;padding:10px;border-radius:8px">
        Please note: Based on evidence patterns we&apos;ve observed, this sender appears to meet ActBlue&apos;s standards for donation matching programs. The AI-detected matching program will not be reported if you submit this case to ActBlue, but it has been logged in our public database for transparency. Please continue to submit similar emails.
      </p>`
    : "";

  // Normalize landing URL (strip query params)
  const landingUrl = sub.landing_url ? (() => {
    try {
      const parsed = new URL(sub.landing_url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return sub.landing_url;
    }
  })() : null;

  // Email HTML with inline styles for email clients
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.5;color:#0f172a;margin:0;padding:0;background-color:#f8fafc">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#3b82f6,#1e40af);color:white;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="margin:0;font-size:24px;font-weight:700">Your AB Jail Case is Ready</h1>
      <p style="margin:8px 0 0 0;opacity:0.9;font-size:14px">Case #${esc(shortId)}</p>
    </div>
    
    <!-- Content -->
    <div style="background:white;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
      <p style="margin:0 0 20px 0;color:#475569;font-size:15px">
        Your submitted case has been analyzed. Review the details below and submit your report to ActBlue.
      </p>

      <!-- Campaign/Org -->
      <div style="margin-bottom:20px">
        <h2 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Campaign/Organization</h2>
        <p style="margin:0;font-size:16px;font-weight:500;color:#0f172a">${esc(campaign)}</p>
      </div>

      <!-- Violations -->
      <div style="margin-bottom:20px">
        <h2 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Detected Violations</h2>
        ${vioHtml}
        ${exemptNoticeHtml}
      </div>

      <!-- Landing Page -->
      ${landingUrl ? `
      <div style="margin-bottom:20px">
        <h2 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Landing Page</h2>
        <p style="margin:0;font-size:14px"><a href="${esc(landingUrl)}" style="color:#3b82f6;text-decoration:underline">${esc(landingUrl)}</a></p>
      </div>
      ` : ""}

      <!-- Evidence (Email HTML or Screenshot) -->
      ${evidenceUrl ? `
      <div style="margin-bottom:24px">
        <h2 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">${evidenceLabel}</h2>
        <p style="margin:0;font-size:14px"><a href="${esc(evidenceUrl)}" style="color:#3b82f6;text-decoration:underline">${esc(evidenceLinkText)}</a></p>
      </div>
      ` : ""}

      <!-- Action Buttons -->
      <div style="margin-top:32px;text-align:center">
        <a href="${submitUrl}" style="display:inline-block;background:#3b82f6;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;margin:8px">
          Submit to ActBlue
        </a>
        <a href="${caseUrl}" style="display:inline-block;background:white;color:#3b82f6;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;border:2px solid #3b82f6;margin:8px">
          Open on AB Jail
        </a>
      </div>

      <!-- Footer Note -->
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center">
        <p style="margin:0;font-size:13px;color:#64748b">
          This case was created from your submission to submit@abjail.org
        </p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8">
          Case UUID: ${esc(sub.id)}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  // Plain text version
  const text = `Your AB Jail Case is Ready - Case #${shortId}

Campaign/Organization
${campaign}

Detected Violations
${violations.length > 0 ? violations.map((v) => `- ${v.code} ${v.title}${v.description ? `: ${v.description}` : ""}`).join("\n") : "(No violations detected)"}${removedVerifiedAb008 > 0 ? `\n\nNote: ActBlue-verified matching program items (AB008) were excluded and will not be reported.` : ""}

${landingUrl ? `Landing Page\n${landingUrl}\n` : ""}
${evidenceUrl ? `${evidenceLabel}\n${evidenceUrl}\n` : ""}

Submit to ActBlue: ${submitUrl}
Open on AB Jail: ${caseUrl}

---
This case was created from your submission to submit@abjail.org
Case UUID: ${sub.id}`;

  // Send email
  console.log("/api/send-case-preview:sending_email", { 
    submissionId, 
    to: sub.forwarder_email,
    violationCount: violations.length,
    hasLandingUrl: !!landingUrl,
    hasEvidenceUrl: !!evidenceUrl,
    evidenceType: evidenceLabel
  });
  
  try {
    const emailResult = await resend.emails.send({
      from: "AB Jail <notifications@abjail.org>",
      to: sub.forwarder_email,
      subject: `Your AB Jail case is ready - Case #${shortId}`,
      text,
      html,
    });
    
    const emailId = emailResult?.data?.id || null;
    console.log("/api/send-case-preview:email_sent", { 
      submissionId, 
      to: sub.forwarder_email,
      emailId
    });

    // Mark as sent
    const updateResult = await supabase
      .from("submissions")
      .update({
        preview_email_sent_at: new Date().toISOString(),
        preview_email_status: "sent",
      })
      .eq("id", submissionId);

    if (updateResult.error) {
      console.error("/api/send-case-preview:update_failed", { 
        submissionId, 
        error: updateResult.error 
      });
    } else {
      console.log("/api/send-case-preview:marked_as_sent", { submissionId });
    }

    const elapsed = Date.now() - startTime;
    console.log("/api/send-case-preview:success", { 
      submissionId, 
      to: sub.forwarder_email,
      elapsedMs: elapsed
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("/api/send-case-preview:send_failed", { 
      submissionId,
      to: sub.forwarder_email,
      error: String(e),
      errorType: e instanceof Error ? e.constructor.name : typeof e,
      errorMessage: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null
    });
    
    // Mark as failed
    const updateResult = await supabase
      .from("submissions")
      .update({
        preview_email_sent_at: new Date().toISOString(),
        preview_email_status: "failed",
      })
      .eq("id", submissionId);

    if (updateResult.error) {
      console.error("/api/send-case-preview:failed_to_mark_failed", { 
        submissionId, 
        error: updateResult.error 
      });
    } else {
      console.log("/api/send-case-preview:marked_as_failed", { submissionId });
    }

    return NextResponse.json({ error: "send_failed", details: String(e) }, { status: 500 });
  }
}

