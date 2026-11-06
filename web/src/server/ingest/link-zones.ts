/**
 * Where a link sits in a message (body vs header/footer) and whether its
 * label reads like a donation ask. Used to rank links before following them.
 */

export type LinkZone = "body" | "header_footer";

const FOOTER_MARKER = /paid for by|unsubscribe|receive fewer emails|this e?-?mail was sent|no longer wish|email preferences|contributions or gifts to|not tax[- ]deductible|privacy policy|all rights reserved/i;

// ActBlue page names used for standing header/footer buttons.
const HEADER_FOOTER_PAGE = /footer|header|ftr|hdr|wrapp?er/i;

// Link labels that read like a donation ask.
const DONATE_INTENT = /\b(donate|donation|give|giving|chip[\s-]?in|contribute|contribution|rush|pitch[\s-]?in)\b|\$\s?\d/i;

// Links written without a scheme (e.g. "bit.ly/abc123"), common in SMS.
// Group 1 is the preceding character, group 2 the link. Requires a dotted host
// followed by a path, so plain words, emails and sentence punctuation do not match.
export const BARE_LINK_PATTERN = /(^|[^\w@.\/=-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}\/[^\s<>"'\)]+)/gi;

export function isHeaderFooterPage(pathname: string): boolean {
  return HEADER_FOOTER_PAGE.test(pathname);
}

export function hasDonateIntent(label: string): boolean {
  return DONATE_INTENT.test(label || "");
}

export type FoundLink = { url: string; index: number; label: string };

const trimTrailing = (url: string) => url.replace(/[.,;:!?)\]]+$/, "");

// Links in plain text with their offsets. The label is the text just before the link on the same line.
export function findLinks(text: string): FoundLink[] {
  const urlPattern = /https?:\/\/[^\s<>"'\)]+/gi;
  const withScheme = Array.from(text.matchAll(urlPattern), (m) => ({ url: trimTrailing(m[0]), index: m.index ?? 0 }));
  const remainder = text.replace(urlPattern, (m) => " ".repeat(m.length));
  const bare = Array.from(remainder.matchAll(BARE_LINK_PATTERN), (m) => ({
    url: `https://${trimTrailing(m[2])}`,
    index: (m.index ?? 0) + m[1].length,
  }));
  return [...withScheme, ...bare]
    .filter((l) => /^https?:\/\/[^/]+/.test(l.url))
    .sort((a, b) => a.index - b.index)
    .map((l) => {
      const lineStart = text.lastIndexOf("\n", l.index) + 1;
      const label = text.slice(Math.max(lineStart, l.index - 80), l.index);
      return { ...l, label };
    });
}

// Zone lookup for character offsets in a message's visible text.
export function zoneLookup(text: string): (index: number) => LinkZone {
  const total = Math.max(1, text.length);
  const searchFrom = Math.floor(total * 0.4);
  const marker = text.slice(searchFrom).search(FOOTER_MARKER);
  const footerStart = marker >= 0 ? searchFrom + marker : Math.floor(total * 0.85);
  // Short messages get proportionally small header and footer margins.
  const headerEnd = total < 1500 ? Math.floor(total * 0.1) : Math.max(150, Math.floor(total * 0.05));
  const slack = Math.min(60, Math.floor(total * 0.05));
  return (index) => (index >= footerStart - slack || index <= headerEnd ? "header_footer" : "body");
}

export type HtmlLink = { href: string; zone: LinkZone; label: string };

const decodeEntities = (s: string) =>
  s.replace(/&amp;/gi, "&").replace(/&nbsp;|&#160;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");

// Each anchor in an HTML body with its label (text plus image alt) and the zone of its position in the visible text.
export function htmlLinks(html: string): HtmlLink[] {
  const anchors: Array<{ href: string; label: string }> = [];
  const marked = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const alts = Array.from(inner.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']*)["']/gi), (a) => a[1]);
      const label = decodeEntities(`${inner.replace(/<[^>]*>/g, " ")} ${alts.join(" ")}`).replace(/\s+/g, " ").trim();
      anchors.push({ href: decodeEntities(href.trim()), label });
      return `\u0000${anchors.length - 1}\u0000${inner}`;
    })
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&zwnj;|&#8204;|[\u00AD\u034F\u180E\u200B-\u200F\u2060\uFEFF]/gi, "") // preheader padding
    .replace(/[^\S\u0000]+/g, " ");

  // Split into text / marker pieces to get each anchor's offset in the visible text.
  const pieces = marked.split(/\u0000(\d+)\u0000/);
  const positions: Array<{ anchor: number; index: number }> = [];
  let visible = "";
  for (let i = 0; i < pieces.length; i++) {
    if (i % 2 === 0) visible += pieces[i];
    else positions.push({ anchor: Number(pieces[i]), index: visible.length });
  }
  const zoneOf = zoneLookup(visible);
  return positions.map((p) => ({ href: anchors[p.anchor].href, label: anchors[p.anchor].label, zone: zoneOf(p.index) }));
}
