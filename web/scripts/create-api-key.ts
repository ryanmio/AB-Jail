/**
 * Generate a new API key, insert it into the api_keys table, and email it to the user.
 *
 * Usage (run from the web/ directory):
 *   npx tsx scripts/create-api-key.ts --name "Jane Reporter" --email "jane@news.org" --description "Investigative reporting"
 *   npx tsx scripts/create-api-key.ts --name "Jane Reporter" --email "jane@news.org" --no-email
 *
 * Requires SUPABASE + RESEND env vars in .env.local
 */

import { randomBytes, createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "web", ".env.local"),
  ];
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
      return;
    } catch {
      // Try next candidate
    }
  }
}

function parseArgs(): { name: string; email: string; description?: string; noEmail: boolean } {
  const args = process.argv.slice(2);
  let name = "";
  let email = "";
  let description = "";
  let noEmail = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) name = args[++i];
    else if (args[i] === "--email" && args[i + 1]) email = args[++i];
    else if (args[i] === "--description" && args[i + 1]) description = args[++i];
    else if (args[i] === "--no-email") noEmail = true;
  }

  if (!name || !email) {
    console.error(
      'Usage: npx tsx scripts/create-api-key.ts --name "Name" --email "email@example.com" [--description "..."] [--no-email]'
    );
    process.exit(1);
  }

  return { name, email, description: description || undefined, noEmail };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://abjail.org";

function buildKeyEmail(name: string, rawKey: string) {
  const text = `Hi ${name},

Your AB Jail API key is ready:

${rawKey}

Quick start:

  curl -H "Authorization: Bearer ${rawKey}" \\
    "${SITE_URL}/api/v1/submissions?limit=5"

Full documentation: ${SITE_URL}/api-access

Important:
- Keep this key secret. Do not commit it to public repositories.
- All endpoints are read-only (GET only).
- Image URLs are temporary signed URLs that expire after 1 hour.
- Paginate with limit (max 100) and offset query parameters.

If you have questions, reply to this email.

-- AB Jail`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#0f172a;margin:0;padding:0;background:#f8fafc">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:24px;font-weight:700">Your API Key</h1>
    <p style="margin:8px 0 0;font-size:14px;opacity:0.9">AB Jail Public API</p>
  </div>
  <div style="background:white;padding:24px;border-radius:0 0 12px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <p>Hi ${esc(name)},</p>
    <p>Your API key is ready. Copy it and keep it somewhere safe &mdash; this is the only time it will be sent.</p>

    <div style="background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;font-family:monospace;font-size:14px;word-break:break-all;margin:16px 0">
      ${esc(rawKey)}
    </div>

    <h3 style="margin:20px 0 8px;font-size:15px">Quick Start</h3>
    <div style="background:#f1f5f9;padding:12px;border-radius:6px;font-family:monospace;font-size:12px;overflow-x:auto;white-space:pre;margin-bottom:16px">curl -H "Authorization: Bearer ${esc(rawKey)}" \\
  "${SITE_URL}/api/v1/submissions?limit=5"</div>

    <h3 style="margin:20px 0 8px;font-size:15px">Available Endpoints</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:4px 8px;font-family:monospace;color:#1e40af">/api/v1/submissions</td><td style="padding:4px 8px">Cases with full text &amp; images</td></tr>
      <tr style="background:#f8fafc"><td style="padding:4px 8px;font-family:monospace;color:#1e40af">/api/v1/violations</td><td style="padding:4px 8px">Detected policy violations</td></tr>
      <tr><td style="padding:4px 8px;font-family:monospace;color:#1e40af">/api/v1/reports</td><td style="padding:4px 8px">Reports filed to ActBlue</td></tr>
      <tr style="background:#f8fafc"><td style="padding:4px 8px;font-family:monospace;color:#1e40af">/api/v1/stats</td><td style="padding:4px 8px">Aggregate statistics</td></tr>
      <tr><td style="padding:4px 8px;font-family:monospace;color:#1e40af">/api/v1/comments</td><td style="padding:4px 8px">Comments on submissions</td></tr>
    </table>

    <p style="margin-top:20px;font-size:13px;color:#64748b">
      Full docs: <a href="${SITE_URL}/api-access" style="color:#1e40af">${SITE_URL}/api-access</a>
    </p>

    <hr style="margin:20px 0;border:none;border-top:1px solid #e2e8f0">
    <p style="font-size:12px;color:#94a3b8">Keep this key secret. Do not commit it to public repos. If you need a new key, reply to this email.</p>
  </div>
</div>
</body></html>`;

  return { text, html };
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    console.error("Make sure .env.local exists in the web/ directory, or run this script from web/.");
    process.exit(1);
  }

  const { name, email, description, noEmail } = parseArgs();

  // Generate key
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(32);
  let suffix = "";
  for (let i = 0; i < 32; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  const rawKey = `abjail_${suffix}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 14);

  // Insert into DB
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { error } = await supabase.from("api_keys").insert({
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name,
    email,
    description: description || null,
  });

  if (error) {
    console.error("Failed to insert API key:", error.message);
    process.exit(1);
  }

  console.log("\n=== API Key Created ===");
  console.log(`Name:    ${name}`);
  console.log(`Email:   ${email}`);
  console.log(`Prefix:  ${keyPrefix}`);
  console.log(`API Key: ${rawKey}`);

  // Email the key
  if (noEmail) {
    console.log("\n--no-email flag set, skipping email delivery.");
    console.log("Send this key to the user manually.\n");
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("\nWarning: RESEND_API_KEY not set. Cannot email the key.");
    console.log("Send this key to the user manually.\n");
    return;
  }

  const resend = new Resend(resendKey);
  const { text, html } = buildKeyEmail(name, rawKey);

  try {
    await resend.emails.send({
      from: "AB Jail <notifications@abjail.org>",
      to: email,
      subject: "Your AB Jail API Key",
      text,
      html,
    });
    console.log(`\nAPI key emailed to ${email}`);
  } catch (err) {
    console.error("\nFailed to send email:", err);
    console.log("Send this key to the user manually.");
  }

  console.log("");
}

main();
