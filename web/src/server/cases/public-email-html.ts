/**
 * How stored email HTML and subjects appear in public responses, attachments
 * and pages. The stored values are left as they are.
 */

import { env } from "../../lib/env.ts";
import { isShownHost } from "./public-links.ts";

const MASK = "########";

// Image hosts that only serve tracking pixels.
const PIXEL_HOSTS = {
  exact: ["click.ngpvan.com"],
  prefix: ["links.e."],
  suffix: [".rs6.net"],
};

// Font services whose addresses keep their parameters.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net", "p.typekit.net"];
const FONT_PARAMS = new Set(["family", "display", "subset"]);

const TAG_NAME = /[A-Za-z][\w:-]*/y;
// One token per step: whitespace, an attribute, or a single stray character.
const ATTR_TOKEN = /(\s+)|([^\s=>"'\/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?|[\s\S]/y;
const REMOTE = /^(?:https?:)?\/\//i;
const ADDRESS = /(?:https?:)?\/\/[^\s"'<>()]*/g;
const LABELLED_ID =
  /\b((?:supporter|member(?:ship)?|subscriber|donor|contact|constituent|recipient|account|customer|user|voter|activist|profile)\s*(?:id|number|no\.?|#)\s*[:#]?(?:\s|&nbsp;|<[^>]*>){0,20})([A-Za-z0-9][A-Za-z0-9-]{3,})/gi;

function isPixelHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    PIXEL_HOSTS.exact.includes(h) ||
    PIXEL_HOSTS.prefix.some((p) => h.startsWith(p)) ||
    PIXEL_HOSTS.suffix.some((s) => h.endsWith(s))
  );
}

function isFontHost(host: string): boolean {
  return FONT_HOSTS.includes(host.toLowerCase());
}

function hostOf(value: string): string | null {
  try {
    return new URL(value.startsWith("//") ? `https:${value}` : value).hostname;
  } catch {
    return null;
  }
}

/** ActBlue or AB Jail page link without parameters; null for anything else. */
function shownLink(value: string): string | null {
  try {
    const url = new URL(value.replace(/&amp;/gi, "&").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!isShownHost(url.hostname)) return null;
    return `${url.origin}${url.pathname.split(/[^A-Za-z0-9._~\/-]/)[0]}`;
  } catch {
    return null;
  }
}

/** Parameters and fragments dropped from every address; font hosts keep their font parameters. */
function trimAddresses(text: string): string {
  return text.replace(ADDRESS, (address: string) => {
    const cut = address.search(/[?#]/);
    if (cut < 0) return address;
    const base = address.slice(0, cut);
    const host = hostOf(base);
    if (!host || !isFontHost(host) || address[cut] !== "?") return base;
    const separator = address.includes("&amp;") ? "&amp;" : "&";
    const params = address.slice(cut + 1).split("#")[0].split(separator).filter((p) => FONT_PARAMS.has(p.split("=")[0].toLowerCase()));
    return params.length ? `${base}?${params.join(separator)}` : base;
  });
}

function listedIds(): string[] {
  return (env.HONEYTRAP_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Mask each listed id where it stands alone, not inside a longer run of letters or digits. */
export function maskListedIds(text: string, ids: string[] = listedIds()): string {
  let out = text;
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi"), MASK);
  }
  return out;
}

/** Mask the value after an id label ("Supporter ID: 12345" => "Supporter ID: ########"). */
export function maskLabelledIds(text: string): string {
  return text.replace(LABELLED_ID, (m, label: string, value: string) => (/\d/.test(value) ? `${label}${MASK}` : m));
}

function isSpace(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13);
}

/**
 * Index of the ">" that closes a tag whose attributes start at `pos`, or -1.
 * A quoted value may not contain "<", so an unclosed quote cannot swallow the
 * markup after it; a quote that cannot close and is followed by whitespace or
 * ">" is a stray character.
 */
function tagEnd(html: string, pos: number): number {
  const n = html.length;
  let i = pos;
  while (i < n) {
    const c = html.charCodeAt(i);
    if (c === 62) return i; // >
    if (c === 60) return -1; // <
    if (c === 34 || c === 39) {
      let k = i + 1;
      while (k < n && html.charCodeAt(k) !== c && html.charCodeAt(k) !== 60) k++;
      if (k < n && html.charCodeAt(k) === c) {
        i = k + 1;
        continue;
      }
      const next = i + 1 < n ? html.charCodeAt(i + 1) : -1;
      if (next === 62 || isSpace(next)) {
        i++;
        continue;
      }
      return -1;
    }
    i++;
  }
  return -1;
}

function publicTag(name: string, attrs: string): string {
  const lower = name.toLowerCase();
  let out = "";
  let pending = "";
  let pixel = false;
  ATTR_TOKEN.lastIndex = 0;
  for (let m = ATTR_TOKEN.exec(attrs); m && m.index < attrs.length; m = ATTR_TOKEN.exec(attrs)) {
    const [token, ws, attr, raw] = m;
    if (ws !== undefined) {
      pending += ws;
      continue;
    }
    let kept: string | null = token;
    if (attr !== undefined) {
      const key = attr.toLowerCase();
      const q = raw && (raw[0] === '"' || raw[0] === "'") ? raw[0] : "";
      const value = raw === undefined ? undefined : q ? raw.slice(1, -1) : raw;
      if (key.startsWith("on")) kept = null;
      else if (value === undefined) kept = token;
      else if (key === "href" || key.endsWith(":href")) {
        const host = lower === "link" ? hostOf(value.trim()) : null;
        const shown = host && isFontHost(host) ? value : shownLink(value);
        kept = shown === null ? null : shown === value ? token : `${attr}="${shown}"`;
      } else if (!REMOTE.test(value.trim())) kept = token;
      else if (key === "src") {
        const host = lower === "img" ? hostOf(value.trim()) : null;
        if (host && isPixelHost(host)) pixel = true;
      } else if (!(key === "srcset" || key === "background" || key === "poster" || key.startsWith("xmlns"))) kept = null;
    }
    if (kept !== null) out += pending + kept;
    pending = "";
  }
  if (pixel) return "";
  return `<${name}${out}${pending}>`;
}

function publicTags(html: string): string {
  let out = "";
  let last = 0;
  let i = html.indexOf("<");
  while (i >= 0) {
    TAG_NAME.lastIndex = i + 1;
    const name = TAG_NAME.exec(html)?.[0];
    const end = name ? tagEnd(html, i + 1 + name.length) : -1;
    if (!name || end < 0) {
      i = html.indexOf("<", i + 1);
      continue;
    }
    out += html.slice(last, i) + publicTag(name, html.slice(i + 1 + name.length, end));
    last = end + 1;
    i = html.indexOf("<", last);
  }
  return out + html.slice(last);
}

/** Email HTML with links, image addresses and visible ids shaped for public display. */
export function publicEmailHtml(html: string | null | undefined, ids?: string[]): string | null {
  if (html == null) return null;
  if (typeof html !== "string" || !html) return html;
  return maskListedIds(maskLabelledIds(publicTags(trimAddresses(html))), ids);
}

/** Email subject with visible ids masked. */
export function publicEmailSubject(subject: string | null | undefined, ids?: string[]): string | null {
  if (subject == null) return null;
  if (typeof subject !== "string" || !subject) return subject;
  return maskListedIds(maskLabelledIds(subject), ids);
}
