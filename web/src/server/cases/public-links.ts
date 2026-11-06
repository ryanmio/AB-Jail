/**
 * How links appear in public responses and pages. The stored values are left
 * as they are; these helpers shape what the server sends out.
 */

const LINK_PLACEHOLDER = "[LINK]";

// An optional scheme (or "//"), a host, then anything that starts a path or parameters.
const LINK_PATTERN =
  /(\b[a-z]{2,6}:\/{1,3}|\/\/)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24})([\/?#&;=%][^\s<>"'`]*)?/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
const PLAIN_PATH = /^(\/[A-Za-z0-9._~\/-]*)?$/;

export function isShownHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "actblue.com" || h.endsWith(".actblue.com") || h === "abjail.org" || h.endsWith(".abjail.org");
}

/** ActBlue page address without parameters; null for anything else. */
export function landingUrlBase(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!isShownHost(parsed.hostname)) return null;
    const path = parsed.pathname.split(/[^A-Za-z0-9._~\/-]/)[0];
    return `${parsed.origin}${path}`;
  } catch {
    return null;
  }
}

/** Message text where every link is replaced, except ActBlue and AB Jail page links without parameters. */
export function publicMessageText(text: string | null | undefined): string | null {
  if (text == null) return null;
  if (typeof text !== "string" || !text) return text;
  return text.replace(LINK_PATTERN, (match: string, scheme: string | undefined, host: string, tail: string | undefined) => {
    const rest = (tail || "").replace(TRAILING_PUNCTUATION, "");
    const trailing = (tail || "").slice(rest.length);
    // A plain domain name in a sentence or email address is not a link.
    if (!scheme && !rest) return match;
    if (isShownHost(host) && PLAIN_PATH.test(rest)) return match;
    return LINK_PLACEHOLDER + trailing;
  });
}
