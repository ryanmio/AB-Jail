// Shared fetcher for /api/cases/[id].
//
// The case detail page mounts several independent "live" components that each
// poll the same endpoint while a case is processing. That endpoint runs ~7
// Supabase queries per call, so the duplicate polls were multiplying serverless
// CPU for no benefit. This dedupes concurrent calls and serves a very short
// cached snapshot so N pollers cost one request per tick instead of N.

type Snapshot = { at: number; promise: Promise<unknown> };

const inflight = new Map<string, Snapshot>();
const TTL_MS = 1500;

export function fetchCaseSnapshot<T = unknown>(id: string): Promise<T> {
  const existing = inflight.get(id);
  if (existing && Date.now() - existing.at < TTL_MS) {
    return existing.promise as Promise<T>;
  }
  const promise = fetch(`/api/cases/${id}`, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) throw new Error(`case fetch failed: ${res.status}`);
    return res.json();
  });
  // Never let a rejected promise stick around as the cached value.
  promise.catch(() => inflight.delete(id));
  inflight.set(id, { at: Date.now(), promise });
  return promise as Promise<T>;
}
