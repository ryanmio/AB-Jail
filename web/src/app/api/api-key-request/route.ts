import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { env } from "@/lib/env";

const RequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Valid email is required"),
  organization: z.string().trim().max(200).optional(),
  use_case: z.string().trim().min(1, "Use case is required").max(2000),
});

export async function POST(req: NextRequest) {
  if (!env.RESEND_API_KEY) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 500 });
  }
  if (!env.DATA_REQUEST_EMAIL) {
    return NextResponse.json({ error: "recipient_not_configured" }, { status: 500 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parseResult = RequestSchema.safeParse(payload);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const data = parseResult.data;
  const resend = new Resend(env.RESEND_API_KEY);

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const text = `New API Key Request\n\nName: ${data.name}\nEmail: ${data.email}\nOrganization: ${data.organization || "N/A"}\n\nIntended Use:\n${data.use_case}\n\nSee the HTML version of this email for the create-key command.`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0f172a;margin:0;padding:0;background:#f8fafc">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:24px;font-weight:700">API Key Request</h1>
    <p style="margin:8px 0 0;font-size:14px;opacity:0.9">Submitted via /api-access</p>
  </div>
  <div style="background:white;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <p><strong>Name:</strong> ${escapeHtml(data.name)}</p>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></p>
    <p><strong>Organization:</strong> ${escapeHtml(data.organization || "N/A")}</p>
    <h3 style="margin:16px 0 8px">Intended Use</h3>
    <p style="white-space:pre-wrap">${escapeHtml(data.use_case)}</p>
    <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0">
    <p style="font-size:13px;color:#64748b">To create a key, run:<br>
    <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px">npx tsx scripts/create-api-key.ts --name "${escapeHtml(data.name)}" --email "${escapeHtml(data.email)}"</code></p>
  </div>
</div>
</body></html>`;

  try {
    await resend.emails.send({
      from: "AB Jail <notifications@abjail.org>",
      to: env.DATA_REQUEST_EMAIL,
      replyTo: data.email,
      subject: `API Key Request from ${data.name}`,
      text,
      html,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api-key-request:send_failed", err);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}
