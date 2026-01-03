/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServer } from "@/lib/supabase-server";
import { env } from "@/lib/env";
import { buildDedupeFields, findDuplicateCase } from "./dedupe";

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
    const host = new URL(url).hostname.toLowerCase();
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

// Normalize URL to base (origin + normalized path)
// Special handling for /go/<id> patterns
function normalizeToBase(url: string): string | null {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    const path = parsed.pathname;
    
    // Special case: /go/<id> or similar tracking patterns
    const goMatch = path.match(/^(\/go\/[^\/]+)/i);
    if (goMatch) {
      return origin + goMatch[1];
    }
    
    // Otherwise: origin + full pathname (normalized)
    const normalized = path
      .replace(/\/+/g, "/") // collapse multiple slashes
      .replace(/\/$/, "");   // remove trailing slash
    
    return origin + (normalized || "/");
  } catch {
    return null;
  }
}

// Follow redirects to resolve tracking URLs (async helper)
// Returns { finalUrl, hops, status } where hops = array of domain transitions
async function followRedirect(
  url: string, 
  maxHops = 5
): Promise<{ finalUrl: string | null; hops: string[]; status: string }> {
  let current = url;
  const hops: string[] = [];
  
  for (let i = 0; i < maxHops; i++) {
    try {
      let res = await fetch(current, { 
        method: "HEAD", 
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ABJail/1.0)" },
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
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ABJail/1.0)" },
          signal: AbortSignal.timeout(3000),
        });
      }
      
      const location = res.headers.get("location");
      if (!location) {
        // No redirect header - this is the final destination
        hops.push(`final(${res.status})`);
        return { finalUrl: current, hops, status: "success" };
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

/**
 * Extract ActBlue landing URL from combined text + HTML links
 * New algorithm:
 * 1. Extract all URLs from text (plain + HTML hrefs)
 * 2. Normalize to base (origin + first path segments, special handling for /go/<id>)
 * 3. Count frequency of each base (pure frequency, no weighting)
 * 4. Try top 5 bases by frequency, follow redirects until ActBlue found
 * 5. Fall back to direct ActBlue links if no CTA bases resolve
 */
async function extractActBlueUrl(
  text: string, 
  submissionId?: string
): Promise<string | null> {
  const logPrefix = submissionId ? `extractActBlueUrl:${submissionId}` : "extractActBlueUrl";
  
  // Step 1: Extract all URLs from text
  const urlPattern = /https?:\/\/[^\s<>"'\)]+/g;
  const rawMatches = text.match(urlPattern) || [];
  
  // Clean trailing punctuation
  const allUrls = rawMatches
    .map(url => url.replace(/[.,;:)\]]+$/, ""))
    .filter(url => url.length > 0);
  
  console.log(`${logPrefix}:extractCandidates`, {
    totalUrls: allUrls.length,
    sampleUrls: allUrls.slice(0, 5)
  });
  
  if (allUrls.length === 0) {
    return null;
  }
  
  // Step 2: Categorize URLs and normalize to bases
  const directActBlueUrls: string[] = [];
  const nonActBlueUrls: string[] = [];
  const skippedUrls: Array<{ url: string; reason: string }> = [];
  
  for (const url of allUrls) {
    // Check blacklist
    const skipCheck = shouldSkipUrl(url);
    if (skipCheck.skip) {
      skippedUrls.push({ url, reason: skipCheck.reason || "unknown" });
      continue;
    }
    
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      // Direct ActBlue domain
      if (host === "actblue.com" || host.endsWith(".actblue.com")) {
        directActBlueUrls.push(url);
      } else {
        nonActBlueUrls.push(url);
      }
    } catch {
      skippedUrls.push({ url, reason: "invalid_url" });
    }
  }
  
  console.log(`${logPrefix}:categorized`, {
    directActBlue: directActBlueUrls.length,
    nonActBlue: nonActBlueUrls.length,
    skipped: skippedUrls.length,
    skippedReasons: skippedUrls.slice(0, 3)
  });
  
  // Step 3: Build frequency map of bases (non-ActBlue URLs = potential CTA tracking links)
  const baseFrequency = new Map<string, { count: number; sampleUrls: string[] }>();
  
  for (const url of nonActBlueUrls) {
    const base = normalizeToBase(url);
    if (!base) continue;
    
    const existing = baseFrequency.get(base);
    if (existing) {
      existing.count++;
      if (existing.sampleUrls.length < 3) {
        existing.sampleUrls.push(url);
      }
    } else {
      baseFrequency.set(base, { count: 1, sampleUrls: [url] });
    }
  }
  
  // Sort bases by frequency (descending), then by path length (longer = more specific)
  const sortedBases = Array.from(baseFrequency.entries())
    .map(([base, stats]) => ({
      base,
      count: stats.count,
      sampleUrl: stats.sampleUrls[0],
      sampleUrls: stats.sampleUrls,
      pathLength: base.split("/").length
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.pathLength - a.pathLength;
    });
  
  console.log(`${logPrefix}:baseCounts`, {
    totalBases: sortedBases.length,
    top10: sortedBases.slice(0, 10).map(b => ({
      base: b.base,
      count: b.count,
      sampleUrl: b.sampleUrl
    }))
  });
  
  // Step 4: Try top 5 bases by frequency, follow redirects
  const TOP_N_BASES = 5;
  const MAX_URLS_PER_BASE = 3; // Try up to 3 concrete URLs per base
  const topBases = sortedBases.slice(0, TOP_N_BASES);
  
  if (topBases.length > 0) {
    console.log(`${logPrefix}:pickingOrder`, {
      bases: topBases.map(b => b.base)
    });
  }
  
  for (const baseInfo of topBases) {
    const urlsToTry = baseInfo.sampleUrls.slice(0, MAX_URLS_PER_BASE);
    
    console.log(`${logPrefix}:redirectAttempt`, {
      base: baseInfo.base,
      count: baseInfo.count,
      urlsToTry: urlsToTry.length
    });
    
    for (const url of urlsToTry) {
      const redirectResult = await followRedirect(url, 5);
      
      console.log(`${logPrefix}:redirectAttempt:result`, {
        base: baseInfo.base,
        url: url.slice(0, 100),
        hops: redirectResult.hops,
        status: redirectResult.status,
        finalUrl: redirectResult.finalUrl?.slice(0, 100)
      });
      
      // Check if final URL is ActBlue
      if (redirectResult.finalUrl) {
        try {
          const finalParsed = new URL(redirectResult.finalUrl);
          const finalHost = finalParsed.hostname.toLowerCase();
          
          if (finalHost === "actblue.com" || finalHost.endsWith(".actblue.com")) {
            // Success! This base resolves to ActBlue
            const actblueBase = `${finalParsed.origin}${finalParsed.pathname}`;
            
            console.log(`${logPrefix}:selectionOutcome`, {
              outcome: "success",
              selectedBase: actblueBase,
              sourceBase: baseInfo.base,
              sourceBaseCount: baseInfo.count,
              hops: redirectResult.hops
            });
            
            return actblueBase;
          }
        } catch {
          // Invalid final URL, continue
        }
      }
    }
    
    // No URLs from this base resolved to ActBlue, try next base
    console.log(`${logPrefix}:redirectAttempt:base_failed`, {
      base: baseInfo.base,
      reason: "no_actblue_resolution"
    });
  }
  
  // Step 5: No CTA bases resolved to ActBlue, fall back to direct ActBlue links
  if (directActBlueUrls.length > 0) {
    // Count frequency of direct ActBlue bases
    const directBaseFrequency = new Map<string, number>();
    
    for (const url of directActBlueUrls) {
      try {
        const parsed = new URL(url);
        const base = `${parsed.origin}${parsed.pathname}`;
        directBaseFrequency.set(base, (directBaseFrequency.get(base) || 0) + 1);
    } catch {
        // Invalid URL, skip
      }
    }
    
    // Pick most common direct ActBlue base
    const sortedDirectBases = Array.from(directBaseFrequency.entries())
      .sort((a, b) => b[1] - a[1]);
    
    if (sortedDirectBases.length > 0) {
      const [base, count] = sortedDirectBases[0];
      
      console.log(`${logPrefix}:selectionOutcome`, {
        outcome: "fallback_to_direct",
        selectedBase: base,
        directActBlueCount: count,
        reason: "no_cta_bases_resolved"
      });
      
      return base;
    }
  }
  
  // No ActBlue URLs found at all
  console.log(`${logPrefix}:selectionOutcome`, {
    outcome: "none_found",
    reason: "no_actblue_urls_after_all_attempts"
  });
  
  return null;
}

export async function ingestTextSubmission(params: IngestTextParams): Promise<IngestResult> {
  const supabase = getSupabaseServer();
  const imageUrl = params.imageUrlPlaceholder || "sms://no-image";
  const heur = computeHeuristic(params.text || "");
  const isFundraising = heur.isFundraising;

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

  // Extract ActBlue landing URL from text AND email HTML (tracking links often only in HTML)
  // Use ORIGINAL unsanitized HTML for URL extraction (sanitized HTML has tracking links removed)
  let textWithHtmlLinks = textForDedupe || "";
  const htmlForExtraction = params.emailBodyOriginal || params.emailBody; // Prefer original, fallback to sanitized
  
  let hrefUrlsCount = 0;
  if (htmlForExtraction) {
    // Extract href URLs from HTML using regex
    const hrefPattern = /href=["']([^"']+)["']/gi;
    const hrefMatches = htmlForExtraction.matchAll(hrefPattern);
    const hrefUrls = Array.from(hrefMatches, m => m[1]);
    hrefUrlsCount = hrefUrls.length;
    textWithHtmlLinks = textWithHtmlLinks + " " + hrefUrls.join(" ");
  }
  
  console.log("ingestTextSubmission:url_extraction_sources", {
    textLength: (textForDedupe || "").length,
    htmlLength: htmlForExtraction ? htmlForExtraction.length : 0,
    hrefUrlsExtracted: hrefUrlsCount,
    hasOriginalHtml: !!params.emailBodyOriginal
  });
  
  // Note: We'll get a submission ID after insert, but we can pass null for now
  // The extraction function will use a generic log prefix
  const landingUrl = await extractActBlueUrl(textWithHtmlLinks);
  if (landingUrl) {
    insertRow.landing_url = landingUrl;
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
  console.log("ingestTextSubmission:inserted", { id: id || null, isFundraising, score: heur.score, hits: heur.hits, landingUrl: landingUrl || null });
  return { ok: true, id, isFundraising, heuristic: heur, landingUrl: landingUrl || null };
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    }).then(async (r) => {
      const text = await r.text().catch(() => "");
      console.log("triggerPipelines:classify", { status: r.status, body: text?.slice(0, 200) });
    }).catch((e) => {
      console.error("triggerPipelines:classify_error", String(e));
    });
    
    const senderPromise = fetch(`${base}/api/sender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    }).then(async (r) => {
      const text = await r.text().catch(() => "");
      console.log("triggerPipelines:sender", { status: r.status, body: text?.slice(0, 200) });
    }).catch((e) => {
      console.error("triggerPipelines:sender_error", String(e));
    });
    
    const redactPiiPromise = fetch(`${base}/api/redact-pii`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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


