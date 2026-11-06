/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServer } from "@/lib/supabase-server";
import { internalHeaders } from "@/lib/internal-auth";
import { env } from "@/lib/env";
import { buildDedupeFields, findDuplicateCase } from "./dedupe";
import { findLinks, hasDonateIntent, htmlLinks, isHeaderFooterPage, zoneLookup, type LinkZone } from "./link-zones";

export type IngestTextParams = {
  text: string; // Cleaned text for AI/heuristics
  rawText?: string; // Original unprocessed text for storage/audit
  senderId?: string | null;
  messageType: "sms" | "email" | "unknown";
  imageUrlPlaceholder?: string;
  emailSubject?: string | null;
  emailBody?: string | null; // Sanitized HTML for display
  emailBodyOriginal?: string | null; // Original unsanitized HTML for URL extraction
  emailFrom?: string | null; // Raw "From" line from email header (e.g., "Name <email@example.com>")
  forwarderEmail?: string | null;
  submissionToken?: string | null;
  mediaUrls?: Array<{ url: string; contentType?: string }>;
  emailSentAt?: Date | null; // Original email send date (for forwarded emails)
};

export type IngestResult = {
  ok: boolean;
  id?: string;
  error?: string;
  isFundraising?: boolean;
  heuristic?: { score: number; hits: string[] };
  landingUrl?: string | null;
  landingLinkPosition?: LinkZone | null;
};

function computeHeuristic(text: string): { isFundraising: boolean; score: number; hits: string[] } {
  const t = (text || "").toLowerCase();
  const positive = [
    "donate",
    "donation",
    "chip in",
    "chip-in",
    "contribute",
    "give now",
    "give today",
    "actblue",
    "match",
    "matched",
    "pitch in",
    "$1",
    "$3",
    "$5",
    "$10",
    "$20",
  ];
  let score = 0;
  const hits: string[] = [];
  for (const kw of positive) {
    if (t.includes(kw)) {
      score += 1;
      hits.push(kw);
    }
  }
  const hasDollar = /\$\d{1,4}/.test(t);
  const isFundraising = score >= 2 || (score >= 1 && hasDollar);
  return { isFundraising, score: score + (hasDollar ? 1 : 0), hits };
}

// Blacklist keywords for URLs to skip (unsubscribe, preferences, social, etc.)
const URL_BLACKLIST_KEYWORDS = [
  "unsubscribe", "unsub", "optout", "opt-out",
  "emailpref", "email-prefs", "preferences", "prefs",
  "manage", "manage-subscriptions", "update-profile"
];

const OPT_OUT_PATH = /fewer|opt[-_]?out|remove[-_]?me|stop[-_]?(text|msg|message|sms|email)|less[-_]?(text|email)|(^|[\/=_-])(stop|quit|leave|cancel)([\/?&=_-]|$)/i;

const SOCIAL_HOSTS = [
  "facebook.com", "twitter.com", "x.com", "instagram.com", 
  "youtube.com", "linkedin.com"
];

// Check if URL should be skipped (blacklist)
function shouldSkipUrl(url: string): { skip: boolean; reason?: string } {
  const urlLower = url.toLowerCase();
  
  if (urlLower.startsWith("mailto:")) {
    return { skip: true, reason: "mailto" };
  }
  
  for (const keyword of URL_BLACKLIST_KEYWORDS) {
    if (urlLower.includes(keyword)) {
      return { skip: true, reason: `blacklist:${keyword}` };
    }
  }
  
  try {
    const parsed = new URL(url);
    const isActBlue = /(^|\.)actblue\.com$/i.test(parsed.hostname);
    // Opt-out pages, matched on path and query only (hosts like stop*.io are fine).
    if (!isActBlue && OPT_OUT_PATH.test(parsed.pathname + parsed.search)) {
      return { skip: true, reason: "opt_out" };
    }
    const host = parsed.hostname.toLowerCase();
    for (const social of SOCIAL_HOSTS) {
      if (host.includes(social)) {
        return { skip: true, reason: `social:${social}` };
      }
    }
  } catch {
    // Invalid URL
    return { skip: true, reason: "invalid_url" };
  }
  
  return { skip: false };
}

// Generic browser UA for link resolution.
const LINK_FOLLOW_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Follow redirects to resolve tracking URLs (async helper)
// Returns { finalUrl, hops, status } where hops = array of domain transitions
export type FollowResult = { finalUrl: string | null; hops: string[]; status: "success" | "error" | "max_hops"; finalStatus?: number };
export type LinkFollower = (url: string, maxHops?: number) => Promise<FollowResult>;

async function followRedirect(url: string, maxHops = 5): Promise<FollowResult> {
  let current = url;
  const hops: string[] = [];
  
  for (let i = 0; i < maxHops; i++) {
    try {
      let res = await fetch(current, { 
        method: "HEAD", 
        redirect: "manual",
        headers: { "User-Agent": LINK_FOLLOW_USER_AGENT },
        signal: AbortSignal.timeout(3000), // 3s timeout per hop
      });
      
      // Some servers do not support HEAD properly; fallback to GET
      // - 405 Method Not Allowed (common for click trackers like ngpvan)
      // - 3xx without Location header (malformed redirect response)
      const needsGetFallback = 
        res.status === 405 || 
        (!res.headers.get("location") && (res.status >= 300 && res.status < 400));
      
      if (needsGetFallback) {
        hops.push(`HEAD:${res.status}→GET`);
        res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: { "User-Agent": LINK_FOLLOW_USER_AGENT },
          signal: AbortSignal.timeout(3000),
        });
      }
      
      const location = res.headers.get("location");
      if (!location) {
        // No redirect header - this is the final destination
        hops.push(`final(${res.status})`);
        return { finalUrl: current, hops, status: "success", finalStatus: res.status };
      }
      
      const next = new URL(location, current).href;
      hops.push(`${new URL(current).hostname} → ${new URL(next).hostname}`);
      current = next;
    } catch (e) {
      // Log WHY it failed
      const error = e instanceof Error ? e.message : String(e);
      hops.push(`ERROR(${error})`);
      return { finalUrl: null, hops, status: "error" };
    }
  }
  
  hops.push(`MAX_HOPS(${maxHops})`);
  return { finalUrl: current, hops, status: "max_hops" };
}

// Log hosts only, never full link addresses.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "invalid";
  }
}

const isActBlueHost = (host: string) => host === "actblue.com" || host.endsWith(".actblue.com");

// Final pages that mean the fetch was blocked rather than answered.
const BLOCKED_HOSTS = ["google.com"];
const isBlockedResult = (r: FollowResult) => {
  if (r.status !== "success" || !r.finalUrl) return true;
  if (r.finalStatus === 403 || r.finalStatus === 429 || (r.finalStatus ?? 0) >= 500) return true;
  const host = hostOf(r.finalUrl);
  return BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
};

export type LinkCandidate = { url: string; intent: boolean; zone: LinkZone; order: number };

// Every link in a message, ranked by donate intent, then body before header/footer, then document order.
export function rankLinkCandidates(input: { text: string; html?: string | null; messageType: string }): LinkCandidate[] {
  const byUrl = new Map<string, LinkCandidate>();
  const add = (url: string, intent: boolean, zone: LinkZone) => {
    const existing = byUrl.get(url);
    if (existing) {
      existing.intent = existing.intent || intent;
      return;
    }
    byUrl.set(url, { url, intent, zone, order: byUrl.size });
  };
  const isEmail = input.messageType === "email";
  if (input.html) {
    for (const link of htmlLinks(input.html)) add(link.href, hasDonateIntent(link.label), isEmail ? link.zone : "body");
  }
  const text = input.text || "";
  const zoneOf = isEmail ? zoneLookup(text) : () => "body" as const;
  for (const link of findLinks(text)) add(link.url, hasDonateIntent(link.label), zoneOf(link.index));

  return Array.from(byUrl.values())
    .filter((c) => /^https?:\/\//i.test(c.url) && !shouldSkipUrl(c.url).skip)
    .sort((a, b) => {
      if (a.intent !== b.intent) return a.intent ? -1 : 1;
      if (a.zone !== b.zone) return a.zone === "body" ? -1 : 1;
      return a.order - b.order;
    });
}

export type ActBlueExtraction = {
  landingUrl: string | null;
  position: LinkZone | null;
  // "none": links were followed, every fetch finished cleanly and none reached ActBlue.
  // "unknown": no candidates, at least one fetch failed, timed out or was blocked, or links were left untried.
  outcome: "actblue" | "none" | "unknown";
  fetches: number;
};

const MAX_FETCHES = 5;

/**
 * Find the ActBlue landing page a donor would reach from this message.
 * Links are ranked by donate intent, body position, then document order.
 * Direct ActBlue links need no fetch; others are followed, up to MAX_FETCHES.
 */
export async function extractActBlueUrl(
  input: { text: string; html?: string | null; messageType: string },
  follow: LinkFollower = followRedirect,
  submissionId?: string
): Promise<ActBlueExtraction> {
  const logPrefix = submissionId ? `extractActBlueUrl:${submissionId}` : "extractActBlueUrl";
  const isEmail = input.messageType === "email";
  const candidates = rankLinkCandidates(input);

  console.log(`${logPrefix}:candidates`, {
    total: candidates.length,
    hosts: Array.from(new Set(candidates.map((c) => hostOf(c.url)))).slice(0, 10),
    withIntent: candidates.filter((c) => c.intent).length,
    inBody: candidates.filter((c) => c.zone === "body").length,
  });

  let headerFooterHit: string | null = null;
  const actBlueBase = (url: string, zone: LinkZone): { base: string; zone: LinkZone } | null => {
    try {
      const parsed = new URL(url);
      if (!isActBlueHost(parsed.hostname.toLowerCase())) return null;
      const base = `${parsed.origin}${parsed.pathname}`;
      // A page named as a header/footer button counts as one wherever its link sits (email only).
      return { base, zone: isEmail && isHeaderFooterPage(parsed.pathname) ? "header_footer" : zone };
    } catch {
      return null;
    }
  };
  const done = (landingUrl: string, position: LinkZone | null, fetches: number, via: string): ActBlueExtraction => {
    console.log(`${logPrefix}:selectionOutcome`, { outcome: "actblue", via, position, fetches });
    return { landingUrl, position, outcome: "actblue", fetches };
  };

  // Direct ActBlue links first: no fetch needed.
  const toFollow: LinkCandidate[] = [];
  for (const c of candidates) {
    const hit = actBlueBase(c.url, c.zone);
    if (!hit) {
      toFollow.push(c);
      continue;
    }
    if (hit.zone === "body") return done(hit.base, "body", 0, "direct");
    headerFooterHit = headerFooterHit ?? hit.base;
  }

  let fetches = 0;
  let allClean = true;
  // A body link that failed or was never tried: header/footer-only can't be confirmed.
  let bodyUnresolved = false;
  for (let i = 0; i < toFollow.length; i++) {
    const c = toFollow[i];
    // Once a header/footer link reached ActBlue, only body links can do better.
    if (headerFooterHit && c.zone !== "body") continue;
    if (fetches >= MAX_FETCHES) {
      allClean = false;
      if (toFollow.slice(i).some((r) => r.zone === "body")) bodyUnresolved = true;
      break;
    }
    fetches++;
    const result = await follow(c.url, 5);
    console.log(`${logPrefix}:follow`, {
      host: hostOf(c.url),
      intent: c.intent,
      zone: c.zone,
      hops: result.hops,
      status: result.status,
      finalHost: result.finalUrl ? hostOf(result.finalUrl) : null,
    });
    const hit = result.finalUrl ? actBlueBase(result.finalUrl, c.zone) : null;
    if (hit) {
      if (hit.zone === "body") return done(hit.base, "body", fetches, "redirect");
      headerFooterHit = headerFooterHit ?? hit.base;
      continue;
    }
    if (isBlockedResult(result)) {
      allClean = false;
      if (c.zone === "body") bodyUnresolved = true;
    }
  }

  if (headerFooterHit) return done(headerFooterHit, bodyUnresolved ? null : "header_footer", fetches, "header_footer");

  const outcome = fetches > 0 && allClean ? "none" : "unknown";
  console.log(`${logPrefix}:selectionOutcome`, { outcome, fetches, candidates: candidates.length });
  return { landingUrl: null, position: null, outcome, fetches };
}

export async function ingestTextSubmission(params: IngestTextParams): Promise<IngestResult> {
  const supabase = getSupabaseServer();
  const imageUrl = params.imageUrlPlaceholder || "sms://no-image";
  const heur = computeHeuristic(params.text || "");

  // Use raw text for duplicate detection if provided, otherwise use cleaned text
  const textForDedupe = params.rawText || params.text;

  // Duplicate detection before insert
  try {
    const dup = await findDuplicateCase(textForDedupe || "");
    if (dup.match && dup.caseId) {
      console.log("ingestTextSubmission:duplicate_detected", { match: dup.match, caseId: dup.caseId, distance: dup.distance });
      return { ok: false, id: dup.caseId, error: "duplicate" };
    }
  } catch (e) {
    console.warn("ingestTextSubmission:dedupe_failed", String(e));
  }

  // Find the ActBlue landing page from text and email HTML (tracking links are often only in HTML).
  // Use the original HTML when available; the sanitized copy has tracking links removed.
  const link = await extractActBlueUrl({
    text: textForDedupe || "",
    html: params.emailBodyOriginal || params.emailBody,
    messageType: params.messageType,
  });
  const landingUrl = link.landingUrl;

  // An ActBlue landing page makes the message public. Links that all resolve
  // cleanly elsewhere hide it. Otherwise the keyword heuristic decides.
  const isFundraising = landingUrl ? true : link.outcome === "none" ? false : heur.isFundraising;

  const insertRow: Record<string, any> = {
    image_url: imageUrl,
    message_type: params.messageType,
    raw_text: params.text, // Store cleaned text (used by AI)
    sender_id: params.senderId || null,
    processing_status: isFundraising ? "ocr" : "done",
    ocr_method: params.messageType === "sms" ? "sms" : "text",
    is_fundraising: isFundraising,
    public: isFundraising, // hide non-fundraising by default
  };
  if (landingUrl) {
    insertRow.landing_url = landingUrl;
    insertRow.landing_link_position = link.position;
  }

  // Add email-specific fields
  if (params.emailSubject) {
    insertRow.email_subject = params.emailSubject;
  }
  if (params.emailBody) {
    insertRow.email_body = params.emailBody;
  }
  if (params.emailBodyOriginal) {
    insertRow.email_body_original = params.emailBodyOriginal;
  }
  if (params.emailFrom) {
    insertRow.email_from = params.emailFrom;
  }
  if (params.forwarderEmail) {
    insertRow.forwarder_email = params.forwarderEmail;
  }
  if (params.submissionToken) {
    insertRow.submission_token = params.submissionToken;
  }
  if (params.mediaUrls && params.mediaUrls.length > 0) {
    insertRow.media_urls = params.mediaUrls;
  }
  if (params.emailSentAt) {
    insertRow.email_sent_at = params.emailSentAt.toISOString();
  }

  try {
    const fields = buildDedupeFields(textForDedupe || "");
    insertRow.normalized_text = fields.normalized_text;
    insertRow.normalized_hash = fields.normalized_hash;
    insertRow.simhash64 = fields.simhash64; // pass as string for int8 safety
  } catch (e) {
    console.warn("ingestTextSubmission:build_fields_failed", String(e));
  }

  const { data, error } = await supabase
    .from("submissions")
    .insert(insertRow)
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  const id = (data as any)?.id as string | undefined;
  console.log("ingestTextSubmission:inserted", { id: id || null, isFundraising, score: heur.score, hits: heur.hits, linkOutcome: link.outcome, fetches: link.fetches, position: link.position });
  return { ok: true, id, isFundraising, heuristic: heur, landingUrl: landingUrl || null, landingLinkPosition: link.position };
}

export async function triggerPipelines(submissionId: string) {
  try {
    // For local development, always use localhost even if NEXT_PUBLIC_SITE_URL is set to production
    const isLocal = process.env.NODE_ENV === "development" || !env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL.includes("localhost");
    const base = isLocal ? "http://localhost:3000" : env.NEXT_PUBLIC_SITE_URL;
    console.log("triggerPipelines:start", { submissionId, base, isLocal });
    
    // Fire all requests in parallel and await them (serverless needs this)
    const classifyPromise = fetch(`${base}/api/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
      body: JSON.stringify({ submissionId }),
    }).then(async (r) => {
      const text = await r.text().catch(() => "");
      console.log("triggerPipelines:classify", { status: r.status, body: text?.slice(0, 200) });
    }).catch((e) => {
      console.error("triggerPipelines:classify_error", String(e));
    });
    
    const senderPromise = fetch(`${base}/api/sender`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
      body: JSON.stringify({ submissionId }),
    }).then(async (r) => {
      const text = await r.text().catch(() => "");
      console.log("triggerPipelines:sender", { status: r.status, body: text?.slice(0, 200) });
    }).catch((e) => {
      console.error("triggerPipelines:sender_error", String(e));
    });
    
    const redactPiiPromise = fetch(`${base}/api/redact-pii`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders() },
      body: JSON.stringify({ submissionId }),
    }).then(async (r) => {
      const text = await r.text().catch(() => "");
      console.log("triggerPipelines:redact-pii", { status: r.status, body: text?.slice(0, 200) });
    }).catch((e) => {
      console.error("triggerPipelines:redact-pii_error", String(e));
    });
    
    // Await all to ensure they complete (Vercel serverless requirement)
    await Promise.all([classifyPromise, senderPromise, redactPiiPromise]);
  } catch (e) {
    console.error("triggerPipelines:exception", String(e));
  }
}


