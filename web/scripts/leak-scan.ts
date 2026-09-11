/**
 * Leak scan: fetches the site's public endpoints and pages and checks that no
 * honeytrap address / tracking ID, no forwarder address, and none of the
 * server-only columns appear in any response. Prints counts only, never values.
 *
 * Usage (run from the web/ directory):
 *   npx tsx scripts/leak-scan.ts                      # scans https://www.abjail.org
 *   npx tsx scripts/leak-scan.ts --site http://localhost:3000
 *
 * Env (from web/.env.local or the shell): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY (to list forwarder addresses), HONEYTRAP_EMAILS, HONEYTRAP_IDS.
 * Exit code 1 if anything leaks, so it can run in CI or a cron.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

for (const p of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "..", ".env.local")]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const argIdx = process.argv.indexOf("--site");
const SITE = (argIdx >= 0 ? process.argv[argIdx + 1] : "https://www.abjail.org").replace(/\/$/, "");

// Columns that must never appear as keys in any public JSON.
const FORBIDDEN_KEYS = [
  "forwarder_email", "forwarderEmail", "submission_token", "email_body_original",
  "uploader_fingerprint", "email_from", "cc_email", "send_token", "key_hash",
  "token_used_at", "html_body", "preview_email_status",
];

async function main() {
  const honey = (process.env.HONEYTRAP_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ids = (process.env.HONEYTRAP_IDS || "").split(",").map((s) => s.trim()).filter((s) => s.length >= 6);

  let forwarders: string[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb.from("submissions").select("forwarder_email").not("forwarder_email", "is", null);
    forwarders = Array.from(new Set((data || []).map((r) => String(r.forwarder_email).toLowerCase())));
  } else {
    console.warn("No Supabase service credentials; skipping forwarder-address check.");
  }

  const get = async (p: string) => (await fetch(SITE + p)).text();
  const cases = JSON.parse(await get("/api/cases?limit=100&offset=0")) as { items?: Array<{ id: string }> };
  const caseIds = (cases.items || []).map((c) => c.id);

  const paths = ["/", "/cases", "/reports", "/api/cases?limit=100&offset=0", "/api/cases?limit=100&offset=100",
    "/api/homepage-stats", "/api/reports", "/api/evaluation/samples", "/api/stats", "/api/stats/advanced"];
  for (const id of caseIds.slice(0, 25)) paths.push(`/api/cases/${id}`, `/api/cases/${id}/landing-url`, `/api/cases/${id}/email-html`, `/cases/${id}`);

  let scanned = 0;
  const keyHits: Record<string, number> = {};
  let honeyHits = 0, idHits = 0, fwdHits = 0;
  const badPaths = new Set<string>();
  for (const p of paths) {
    let body = "";
    try { body = await get(p); } catch { continue; }
    scanned++;
    const low = body.toLowerCase();
    const label = p.replace(/[0-9a-f-]{36}/, "<id>");
    for (const k of FORBIDDEN_KEYS) if (new RegExp(`"${k}"\\s*:`).test(body)) { keyHits[k] = (keyHits[k] || 0) + 1; badPaths.add(label); }
    for (const h of honey) if (low.includes(h)) { honeyHits++; badPaths.add(label); }
    for (const i of ids) if (body.includes(i)) { idHits++; badPaths.add(label); }
    for (const f of forwarders) if (low.includes(f)) { fwdHits++; badPaths.add(label); }
  }

  console.log(`site: ${SITE}`);
  console.log(`responses scanned: ${scanned}`);
  console.log(`forbidden keys: ${Object.keys(keyHits).length ? JSON.stringify(keyHits) : "none"}`);
  console.log(`honeytrap address occurrences: ${honeyHits} (${honey.length} addresses checked)`);
  console.log(`honeytrap tracking-id occurrences: ${idHits} (${ids.length} ids checked)`);
  console.log(`forwarder address occurrences: ${fwdHits} (${forwarders.length} forwarders checked)`);
  if (badPaths.size) {
    console.log("paths with hits:", Array.from(badPaths).join(", "));
    process.exit(1);
  }
  console.log("clean");
}

main().catch((e) => { console.error(e); process.exit(1); });
