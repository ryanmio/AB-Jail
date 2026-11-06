/**
 * How links appear in public responses and pages. The stored values are left
 * as they are; these helpers shape what the server sends out.
 */

import { BARE_LINK_PATTERN } from "../ingest/link-zones.ts";

const LINK_PLACEHOLDER = "[LINK]";

const SCHEME_LINK_PATTERN = /https?:\/\/[^\s<>"'\)]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
// Anything else that still reads as a host, path and parameters (e.g. a link with a damaged scheme).
const LEFTOVER_PARAMS_PATTERN = /(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}\/[^\s<>"']*[?#][^\s<>"']+/gi;

/** Scheme, host and path of a link; null when it does not parse. */
export function landingUrlBase(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

// Hosts whose page links are shown as written when they carry no parameters.
function isKnownPageHost(host: string): boolean {
  return host === "actblue.com" || host.endsWith(".actblue.com") || host === "abjail.org" || host.endsWith(".abjail.org");
}

/** True when a link can be shown as written. */
export function isPlainLink(link: string): boolean {
  if (/[?#]/.test(link)) return false;
  const withScheme = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.username || parsed.password) return false;
    return isKnownPageHost(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function replaceLink(match: string): string {
  const link = match.replace(TRAILING_PUNCTUATION, "");
  const trailing = match.slice(link.length);
  return (isPlainLink(link) ? link : LINK_PLACEHOLDER) + trailing;
}

/** Message text with each link either left as written or replaced by a placeholder. */
export function publicMessageText(text: string | null | undefined): string | null {
  if (text == null) return null;
  if (typeof text !== "string" || !text) return text;
  const spans: Array<{ start: number; end: number; out: string }> = [];
  for (const m of text.matchAll(SCHEME_LINK_PATTERN)) {
    const start = m.index ?? 0;
    spans.push({ start, end: start + m[0].length, out: replaceLink(m[0]) });
  }
  const masked = text.replace(SCHEME_LINK_PATTERN, (m) => " ".repeat(m.length));
  for (const m of masked.matchAll(BARE_LINK_PATTERN)) {
    const start = (m.index ?? 0) + m[1].length;
    spans.push({ start, end: start + m[2].length, out: replaceLink(m[2]) });
  }
  spans.sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    result += text.slice(cursor, span.start) + span.out;
    cursor = span.end;
  }
  result += text.slice(cursor);
  return result.replace(LEFTOVER_PARAMS_PATTERN, LINK_PLACEHOLDER);
}
