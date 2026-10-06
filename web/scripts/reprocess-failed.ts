/**
 * Re-run the AI pipeline (sender, classify, PII redaction) for submissions left
 * in the "error" state, for example after an OpenAI outage.
 *
 * Works oldest-first in capped batches so a backlog can be spread over several
 * days. Only rows still in "error" are picked up, so re-running continues where
 * the last batch stopped. Stops at the first OpenAI failure.
 *
 * Usage (run from the web/ directory):
 *   # Dry run: count what would be reprocessed
 *   npx tsx scripts/reprocess-failed.ts --since 2026-10-01
 *
 *   # Reprocess a batch
 *   npx tsx scripts/reprocess-failed.ts --since 2026-10-01 --limit 10 --apply
 *
 * Flags:
 *   --since <ISO>     start of window (required)
 *   --until <ISO>     end of window (default: now)
 *   --limit <n>       max submissions this run (default 25)
 *   --id <uuid>       reprocess this one submission regardless of its state
 *   --apply           reprocess; without it nothing is changed
 *   --delay <ms>      pause between submissions (default 3000)
 *   --site <url>      target site (default https://www.abjail.org)
 *
 * Env (from web/.env.local, the repo-root .env.local, or the shell):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_API_SECRET
 *   (INTERNAL_API_SECRET must match the target site's value)
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  // Look in web/.env.local and the repo-root .env.local.
  for (const p of [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "..", ".env.local")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      if (process.env[k]) continue;
      process.env[k] = raw.replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.INTERNAL_API_SECRET;
const SINCE = arg("since");
const UNTIL = arg("until");
const LIMIT = Number(arg("limit") ?? 25);
const ONLY_ID = arg("id");
const APPLY = flag("apply");
const DELAY_MS = Number(arg("delay") ?? 3000);
const SITE = (arg("site") ?? "https://www.abjail.org").replace(/\/$/, "");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (set in .env.local or the shell).");
  process.exit(1);
}
if (!ONLY_ID && (!SINCE || Number.isNaN(new Date(SINCE).getTime()))) {
  console.error("--since <ISO timestamp> is required.");
  process.exit(1);
}
if (!Number.isFinite(LIMIT) || LIMIT < 1) {
  console.error("--limit must be a positive number.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type StepResult = { ok: boolean; status: number; body: string };

async function callStep(path: string, payload: Record<string, unknown>): Promise<StepResult> {
  // Steps are idempotent, so a dropped connection is safe to retry.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${SITE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "abjail-reprocess/1.0", "x-internal-secret": SECRET! },
        body: JSON.stringify(payload),
      });
      const body = await res.text().catch(() => "");
      return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
    } catch (e) {
      const msg = e instanceof Error ? `${e.message} ${(e.cause as { code?: string } | undefined)?.code ?? ""}`.trim() : String(e);
      if (attempt >= 4) return { ok: false, status: 0, body: `network error: ${msg}` };
      console.log(`    ${path} network error (${msg}), retry ${attempt}/3`);
      await sleep(5000 * attempt);
    }
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);
  const sinceIso = new Date(SINCE ?? 0).toISOString();
  const untilIso = (UNTIL ? new Date(UNTIL) : new Date()).toISOString();
  console.log(`Window: ${sinceIso} -> ${untilIso}   Site: ${SITE}   Mode: ${APPLY ? "APPLY" : "dry run"}`);

  const failedQuery = () =>
    (ONLY_ID
      ? supabase
          .from("submissions")
          .select("id, created_at, forwarder_email, preview_email_sent_at", { count: "exact" })
          .eq("id", ONLY_ID)
      : supabase
          .from("submissions")
          .select("id, created_at, forwarder_email, preview_email_sent_at", { count: "exact" })
          .eq("processing_status", "error"))
      .gte("created_at", sinceIso)
      .lte("created_at", untilIso)
      .order("created_at", { ascending: true });

  const { data, count, error } = await failedQuery().limit(APPLY ? LIMIT : 1000);
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  const rows = data ?? [];
  const total = count ?? rows.length;
  console.log(ONLY_ID ? `Submission ${ONLY_ID}: ${total ? "found" : "not found"}` : `Submissions in error state: ${total}`);
  if (rows.length) console.log(`Oldest: ${rows[0].created_at}   Newest in this page: ${rows[rows.length - 1].created_at}`);

  if (!APPLY) {
    const byDay = new Map<string, number>();
    let previews = 0;
    for (const r of rows) {
      const day = String(r.created_at).slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      if (r.forwarder_email && !r.preview_email_sent_at) previews++;
    }
    for (const [day, n] of byDay) console.log(`  ${day}  ${n}`);
    console.log(`Would send a case preview email on success: ${previews}`);
    console.log(`\nDry run only. Re-run with --apply to reprocess up to ${LIMIT} (use --limit to change).`);
    return;
  }

  if (!SECRET) {
    console.error("INTERNAL_API_SECRET is required with --apply.");
    process.exit(1);
  }

  let ok = 0, i = 0;
  for (const row of rows) {
    i++;
    const label = `[${i}/${rows.length}] ${row.id} ${String(row.created_at).slice(0, 19)}`;
    const submissionId = row.id as string;

    // Sender first: classify's exemption check matches on the sender name.
    const sender = await callStep("/api/sender", { submissionId });
    if (!sender.ok) {
      console.log(`${label}  sender FAILED ${sender.status} ${sender.body}`);
      console.log("\nStopping: sender failed. Fix the cause and re-run; remaining rows are untouched.");
      break;
    }
    const classify = await callStep("/api/classify", { submissionId, includeExistingComments: true });
    if (!classify.ok) {
      console.log(`${label}  sender=ok classify FAILED ${classify.status} ${classify.body}`);
      console.log(`\nStopping: classify failed. Once fixed, finish this one with --id ${submissionId}`);
      break;
    }
    // Redact last so the earlier steps see the same text the live pipeline does.
    const redact = await callStep("/api/redact-pii", { submissionId });
    console.log(`${label}  sender=ok classify=ok redact=${redact.ok ? "ok" : `FAILED ${redact.status}`}`);
    if (!redact.ok) {
      console.log(`    redact: ${redact.body}`);
      console.log(`\nStopping: redaction failed. Once fixed, finish this one with --id ${submissionId}`);
      break;
    }
    ok++;
    if (i < rows.length) await sleep(DELAY_MS);
  }

  const { count: remaining } = await failedQuery().limit(1);
  console.log(`\nDone. reprocessed=${ok}${ONLY_ID ? "" : `   still in error state: ${remaining ?? "?"}`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
