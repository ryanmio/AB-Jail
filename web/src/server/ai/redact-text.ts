// Text helpers for the PII redaction step.

/** Words a reader sees in an HTML email: no styles, scripts, tags or layout spacing. */
export function visibleText(html: string): string {
  return html
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<img\b[^>]*\balt\s*=\s*"([^"]*)"[^>]*>/gi, " $1 ")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#8217;|&rsquo;/gi, "’")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&[a-zA-Z#0-9]+;/g, " ")
    .replace(/[​-‍͏­⁠﻿]/g, "")
    .replace(/[ \t\r\f\v ]+/g, " ")
    .replace(/ *\n[\n ]*/g, "\n")
    .trim();
}

const SEP = String.raw`(?:\s|&nbsp;|&#160;|<[^>]*>)+`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Star the letters of a match; keep any tags or entities inside it.
const mask = (m: string) =>
  m.split(/(<[^>]*>|&[a-zA-Z#0-9]+;)/).map((p, i) => (i % 2 ? p : p.replace(/\S/g, "*"))).join("");

/**
 * Replace each string with asterisks. Matches whole words only, the string as
 * given or in capitals, with any spacing or tags between its words.
 */
export function redactStrings(text: string, strings: string[]): string {
  const set = new Set<string>();
  for (const raw of strings) {
    const s = raw.trim();
    if (!s) continue;
    set.add(s);
    const stripped = s.replace(/[.,;:!?]+$/, "");
    if (stripped && stripped !== s) set.add(stripped);
  }
  let out = text;
  for (const s of Array.from(set).sort((a, b) => b.length - a.length)) {
    if (!/[A-Za-z0-9]/.test(s)) continue;
    const pattern = (v: string) => v.split(/\s+/).map(escape).join(SEP);
    const forms = Array.from(new Set([pattern(s), pattern(s.toUpperCase())]));
    const pre = /^[A-Za-z0-9]/.test(s) ? "(?<![A-Za-z0-9])" : "";
    const post = /[A-Za-z0-9]$/.test(s) ? "(?![A-Za-z0-9])" : "";
    out = out.replace(new RegExp(`${pre}(?:${forms.join("|")})${post}`, "g"), mask);
  }
  return out;
}
