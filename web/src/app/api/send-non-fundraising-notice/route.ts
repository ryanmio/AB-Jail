import { NextRequest, NextResponse } from "next/server";
import { requireInternalSecret } from "@/lib/internal-auth";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const denied = requireInternalSecret(req);
  if (denied) return denied;

  const startTime = Date.now();
  console.log("/api/send-non-fundraising-notice:start", { timestamp: new Date().toISOString() });
  
  if (!env.RESEND_API_KEY) {
    console.error("/api/send-non-fundraising-notice:error resend_key_missing");
    return NextResponse.json({ error: "resend_key_missing" }, { status: 400 });
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const supabase = getSupabaseServer();

  const body = await req.json().catch(() => null);
  const submissionId: string | undefined = body?.submissionId;
  
  console.log("/api/send-non-fundraising-notice:parsed_body", { submissionId, hasBody: !!body });
  
  if (!submissionId) {
    console.error("/api/send-non-fundraising-notice:error missing_args", { body });
    return NextResponse.json({ error: "missing_args" }, { status: 400 });
  }

  // Fetch submission data
  console.log("/api/send-non-fundraising-notice:fetching_submission", { submissionId });
  const { data: rows, error: err } = await supabase
    .from("submissions")
    .select("id, sender_name, sender_id, forwarder_email")
    .eq("id", submissionId)
    .limit(1);

  if (err) {
    console.error("/api/send-non-fundraising-notice:error load_failed", { submissionId, error: err });
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const sub = rows?.[0] as
    | { id: string; sender_name?: string | null; sender_id?: string | null; forwarder_email?: string | null }
    | undefined;

  console.log("/api/send-non-fundraising-notice:submission_loaded", { 
    submissionId, 
    found: !!sub, 
    hasForwarderEmail: !!sub?.forwarder_email
  });

  if (!sub) {
    console.error("/api/send-non-fundraising-notice:error not_found", { submissionId });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Skip if no forwarder email (screenshot/paste submissions)
  if (!sub.forwarder_email) {
    console.log("/api/send-non-fundraising-notice:skip no_forwarder_email", { submissionId });
    return NextResponse.json({ ok: true, skipped: "no_forwarder_email" }, { status: 200 });
  }

  // Get campaign name (if available)
  const campaign = sub.sender_name || sub.sender_id || "(unknown sender)";

  // Build email content
  const shortId = sub.id.split("-")[0];
  const siteUrl = env.NEXT_PUBLIC_SITE_URL || "https://abjail.org";

  // Helper function to escape HTML
  const esc = (s: string) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Email HTML with inline styles matching case preview format
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
      <h1 style="margin:0;font-size:24px;font-weight:700">Thanks for Your Submission</h1>
      <p style="margin:8px 0 0 0;opacity:0.9;font-size:14px">Case #${esc(shortId)}</p>
    </div>
    
    <!-- Content -->
    <div style="background:white;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
      <p style="margin:0 0 20px 0;color:#475569;font-size:15px">
        Thanks for your submission. We currently only support fundraising emails. We are working on expanding to other email types so stay tuned.
      </p>

      <!-- Campaign/Org (if detected) -->
      <div style="margin-bottom:20px">
        <h2 style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">From</h2>
        <p style="margin:0;font-size:16px;font-weight:500;color:#0f172a">${esc(campaign)}</p>
      </div>

      <!-- Learn More Link -->
      <div style="margin-top:32px;text-align:center">
        <a href="${siteUrl}" style="display:inline-block;background:#3b82f6;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;margin:8px">
          Visit AB Jail
        </a>
      </div>

      <!-- Footer Note -->
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center">
        <p style="margin:0;font-size:13px;color:#64748b">
          This is an automated response from submit@abjail.org
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
  const text = `Thanks for Your Submission - Case #${shortId}

Thanks for your submission. We currently only support fundraising emails. We are working on expanding to other email types so stay tuned.

From: ${campaign}

Visit AB Jail: ${siteUrl}

---
This is an automated response from submit@abjail.org
Case UUID: ${sub.id}`;

  // Send email
  console.log("/api/send-non-fundraising-notice:sending_email", { 
    submissionId, 
    to: sub.forwarder_email,
    campaign
  });
  
  try {
    const emailResult = await resend.emails.send({
      from: "AB Jail <notifications@abjail.org>",
      to: sub.forwarder_email,
      subject: `Thanks for your submission - Case #${shortId}`,
      text,
      html,
    });
    
    const emailId = emailResult?.data?.id || null;
    console.log("/api/send-non-fundraising-notice:email_sent", { 
      submissionId, 
      to: sub.forwarder_email,
      emailId
    });

    const elapsed = Date.now() - startTime;
    console.log("/api/send-non-fundraising-notice:success", { 
      submissionId, 
      to: sub.forwarder_email,
      elapsedMs: elapsed
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("/api/send-non-fundraising-notice:send_failed", { 
      submissionId,
      to: sub.forwarder_email,
      error: String(e),
      errorType: e instanceof Error ? e.constructor.name : typeof e,
      errorMessage: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null
    });
    
    return NextResponse.json({ error: "send_failed", details: String(e) }, { status: 500 });
  }
}

