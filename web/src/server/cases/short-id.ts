/**
 * Short case IDs: the first 8 characters of a case UUID, as printed in
 * "Case #xxxxxxxx" on outgoing emails.
 */

const SHORT_ID = /^[0-9a-f]{8}$/i;

export type ShortIdRow = { id: string; created_at: string | null };

/** Finds the cases whose id falls between `lo` and `hi`, inclusive. */
export type ShortIdLookup = (lo: string, hi: string) => Promise<ShortIdRow[]>;

export function isShortCaseId(id: string): boolean {
  return SHORT_ID.test(id);
}

/** The lowest and highest UUIDs that start with this short ID. */
export function shortIdRange(shortId: string): [string, string] {
  const prefix = shortId.toLowerCase();
  return [`${prefix}-0000-0000-0000-000000000000`, `${prefix}-ffff-ffff-ffff-ffffffffffff`];
}

/**
 * Turns a short ID into the full case UUID, or null when no case has it.
 * If more than one case shares the short ID, the oldest one keeps it.
 * Anything that is not a short ID is returned unchanged.
 */
export async function resolveCaseId(id: string, lookup: ShortIdLookup): Promise<string | null> {
  if (!isShortCaseId(id)) return id;
  const [lo, hi] = shortIdRange(id);
  const rows = await lookup(lo, hi);
  if (rows.length === 0) return null;
  const oldest = [...rows].sort(
    (a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id)
  )[0];
  return oldest.id;
}
