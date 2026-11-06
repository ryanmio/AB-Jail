import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { getSupabaseServer } from "@/lib/supabase-server";
import { publicEmailHtml } from "@/server/cases/public-email-html";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  console.log("/api/send-queued-report:start", { timestamp: new Date().toISOString() });

  if (!env.RESEND_API_KEY) {
    console.error("/api/send-queued-report:error resend_key_missing");
    return createHtmlResponse("Error", "Email service not configured.", "error");
  }

  if (!env.REPORT_EMAIL_TO) {
    console.error("/api/send-queued-report:error missing_report_to");
    return createHtmlResponse("Error", "Report destination not configured.", "error");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const supabase = getSupabaseServer();

  // Get token from query params
  const token = req.nextUrl.searchParams.get("token");
  console.log("/api/send-queued-report:parsed_params", { hasToken: !!token });

  if (!token) {
    console.error("/api/send-queued-report:error missing_token");
    return createHtmlResponse("Error", "Missing token parameter.", "error");
  }

  // Find queued report by token
  const { data: reportRows, error: reportErr } = await supabase
    .from("reports")
    .select("id, case_id, to_email, cc_email, subject, body, html_body, screenshot_url, landing_url, status")
    .eq("send_token", token)
    .limit(1);

  if (reportErr) {
    console.error("/api/send-queued-report:error load_failed", { error: reportErr });
    return createHtmlResponse("Error", "Failed to load report.", "error");
  }

  const report = reportRows?.[0] as {
    id: string;
    case_id: string;
    to_email: string;
    cc_email?: string | null;
    subject: string;
    body: string;
    html_body?: string | null;
    screenshot_url?: string | null;
    landing_url: string;
    status: string;
  } | undefined;

  if (!report) {
    console.error("/api/send-queued-report:error not_found");
    return createHtmlResponse("Not Found", "Report not found or invalid token.", "error");
  }

  console.log("/api/send-queued-report:report_found", { 
    reportId: report.id, 
    caseId: report.case_id,
    status: report.status 
  });

  // Check if already sent
  if (report.status === "sent") {
    console.log("/api/send-queued-report:already_sent", { reportId: report.id });
    return createHtmlResponse(
      "Already Sent",
      `This report has already been sent to ActBlue.`,
      "info",
      report.case_id
    );
  }

  // Check if status is queued (can only send queued reports)
  if (report.status !== "queued") {
    console.log("/api/send-queued-report:invalid_status", { reportId: report.id, status: report.status });
    return createHtmlResponse(
      "Cannot Send",
      `This report cannot be sent (status: ${report.status}).`,
      "error",
      report.case_id
    );
  }

  // Fetch case for attachments
  const { data: subRows } = await supabase
    .from("submissions")
    .select("id, email_body, raw_text")
    .eq("id", report.case_id)
    .limit(1);
  
  const sub = subRows?.[0] as { id: string; email_body?: string | null; raw_text?: string | null } | undefined;

  // Build attachments
  const attachments: Array<{ filename: string; content: string; type?: string }> = [];
  const emailHtml = publicEmailHtml(sub?.email_body);
  if (emailHtml) {
    const base64 = Buffer.from(emailHtml, "utf8").toString("base64");
    attachments.push({ filename: "original_email.html", content: base64, type: "text/html" });
  } else if (sub?.raw_text) {
    const base64 = Buffer.from(String(sub.raw_text), "utf8").toString("base64");
    attachments.push({ filename: "original_text.txt", content: base64, type: "text/plain" });
  }

  // Send the email
  const fromEmail = "reports@abjail.org";
  console.log("/api/send-queued-report:sending_email", { 
    reportId: report.id, 
    to: report.to_email 
  });

  try {
    await resend.emails.send({
      to: report.to_email,
      from: fromEmail,
      replyTo: env.REPORT_EMAIL_FROM as string,
      cc: report.cc_email || undefined,
      subject: report.subject,
      text: report.body,
      html: report.html_body || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  } catch (e) {
    console.error("/api/send-queued-report:send_failed", { 
      reportId: report.id,
      error: String(e),
      errorMessage: e instanceof Error ? e.message : String(e)
    });

    // Update status to failed
    await supabase
      .from("reports")
      .update({ status: "failed" })
      .eq("id", report.id);

    return createHtmlResponse(
      "Send Failed",
      `Failed to send the report. Please try again later. Error: ${e instanceof Error ? e.message : String(e)}`,
      "error",
      report.case_id
    );
  }

  // Update status to sent and clear token
  const { error: updateErr } = await supabase
    .from("reports")
    .update({ 
      status: "sent",
      send_token: null 
    })
    .eq("id", report.id);

  if (updateErr) {
    console.error("/api/send-queued-report:update_failed", { reportId: report.id, error: updateErr });
  }

  // Add case comment
  await supabase.from("comments").insert({ 
    submission_id: report.case_id, 
    content: `Report filed with ActBlue on ${new Date().toISOString()} (manually sent from queue).`, 
    kind: "landing_page" 
  });

  const elapsed = Date.now() - startTime;
  console.log("/api/send-queued-report:success", { 
    reportId: report.id, 
    caseId: report.case_id,
    elapsedMs: elapsed
  });

  return createHtmlResponse(
    "Report Sent!",
    "The report has been successfully sent to ActBlue.",
    "success",
    report.case_id
  );
}

function createHtmlResponse(
  title: string, 
  message: string, 
  type: "success" | "error" | "info",
  caseId?: string
): NextResponse {
  const colors = {
    success: { gradient: "linear-gradient(135deg,#22c55e,#16a34a)", icon: "✓" },
    error: { gradient: "linear-gradient(135deg,#ef4444,#dc2626)", icon: "✕" },
    info: { gradient: "linear-gradient(135deg,#3b82f6,#1e40af)", icon: "ℹ" },
  };

  const { gradient, icon } = colors[type];
  const caseUrl = caseId ? `${env.NEXT_PUBLIC_SITE_URL}/cases/${caseId}` : null;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - AB Jail</title>
</head>
<body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.5;color:#0f172a;margin:0;padding:0;background-color:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center">
  <div style="max-width:480px;margin:0 auto;padding:20px">
    <div style="background:${gradient};color:white;padding:32px;border-radius:12px 12px 0 0;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">${icon}</div>
      <h1 style="margin:0;font-size:28px;font-weight:700">${title}</h1>
    </div>
    <div style="background:white;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center">
      <p style="margin:0 0 24px 0;color:#475569;font-size:16px">${message}</p>
      ${caseUrl ? `
      <a href="${caseUrl}" style="display:inline-block;background:#3b82f6;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
        View Case
      </a>
      ` : `
      <a href="${env.NEXT_PUBLIC_SITE_URL}" style="display:inline-block;background:#3b82f6;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
        Go to AB Jail
      </a>
      `}
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

