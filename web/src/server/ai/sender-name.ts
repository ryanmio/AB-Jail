/**
 * Tidies a sender name returned by the model so one sender is stored one way:
 * straight apostrophes, no bracketed text such as "(DNC)", single spaces.
 */
export function cleanSenderName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const cleaned = name
    .replace(/[‘’]/g, "'")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
