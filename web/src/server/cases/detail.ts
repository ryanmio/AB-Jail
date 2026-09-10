import { getSupabaseServer } from "@/lib/supabase-server";

// Shared data layer for a single case. Used by both the /api/cases/[id]* route
// handlers and the server-rendered /cases/[id] page, so the page can read
// Supabase directly instead of invoking its own API routes over HTTP (which
// cost one serverless invocation each per render).

type ViolationRow = {
  severity?: number | string | null;
  confidence?: number | string | null;
  description?: string | null;
};

export type CaseDetail = {
  item: Record<string, unknown> | null;
  violations: Array<Record<string, unknown>>;
  summary: string | null;
  comments: Array<Record<string, unknown>>;
  reports: Array<Record<string, unknown>>;
  report_replies: Array<Record<string, unknown>>;
  verdict: Record<string, unknown> | null;
  hasReport: boolean;
};

// Columns that must never leave the server. They hold the one-time report
// token, the unredacted original email HTML (which still contains honeytrap
// addresses and tracking IDs), uploader identifiers, and the raw From line
// (historically the SMTP envelope/bounce address, which encodes the recipient).
export const SENSITIVE_SUBMISSION_COLUMNS = [
  "email_body_original",
  "email_from",
  "submission_token",
  "token_used_at",
  "uploader_fingerprint",
  "preview_email_status",
] as const;

export function stripSensitiveSubmissionColumns<T extends Record<string, unknown>>(row: T): T {
  for (const key of SENSITIVE_SUBMISSION_COLUMNS) delete row[key];
  return row;
}

export async function getCaseDetail(id: string): Promise<CaseDetail | null> {
  const supabase = getSupabaseServer();
  const { data: items, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  const item = items?.[0] ? stripSensitiveSubmissionColumns(items[0] as Record<string, unknown>) : null;
  if (!item) return null;

  // Independent lookups; run them concurrently.
  const [viosRes, commentsRes, reportsRes, landingNotesRes, repliesRes, verdictRes] = await Promise.all([
    supabase.from("violations").select("*").eq("submission_id", id),
    supabase
      .from("comments")
      .select("id, content, created_at, kind")
      .eq("submission_id", id)
      .eq("kind", "user")
      .order("created_at", { ascending: true })
      .limit(10),
    supabase
      .from("reports")
      .select("id, case_id, to_email, subject, body, screenshot_url, landing_url, status, created_at")
      .eq("case_id", id)
      .order("created_at", { ascending: true }),
    // Secondary signal for hasReport that does not rely on reports table access (RLS-safe)
    supabase
      .from("comments")
      .select("id, content")
      .eq("submission_id", id)
      .eq("kind", "landing_page")
      .ilike("content", "Report filed%")
      .limit(1),
    supabase
      .from("report_replies")
      .select("id, report_id, case_id, from_email, body_text, created_at")
      .eq("case_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("report_verdicts")
      .select("id, case_id, verdict, explanation, determined_by, created_at, updated_at")
      .eq("case_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (viosRes.error) throw viosRes.error;

  const vios = (viosRes.data || []) as Array<Record<string, unknown>>;
  // Prefer stored AI summary; fall back to top violation rationale
  let summary: string | null = (item as { ai_summary?: string | null }).ai_summary ?? null;
  const list = vios as Array<ViolationRow>;
  if (!summary && list.length > 0) {
    const sorted = [...list].sort(
      (a, b) =>
        Number(b.severity ?? 0) - Number(a.severity ?? 0) ||
        (Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    );
    summary = sorted[0]?.description ?? null;
  }

  const reportRows = reportsRes.data || [];
  const landingNotes = landingNotesRes.data || [];
  const hasReport = reportRows.length > 0 || landingNotes.length > 0;

  return {
    item,
    violations: vios,
    summary,
    comments: commentsRes.data || [],
    reports: reportRows,
    report_replies: repliesRes.data || [],
    verdict: verdictRes.data?.[0] || null,
    hasReport,
  };
}

function parseSupabaseUrl(u: string | null | undefined) {
  if (!u || !u.startsWith("supabase://")) return null;
  const rest = u.replace("supabase://", "");
  const [bucket, ...pathParts] = rest.split("/");
  const path = pathParts.join("/");
  return { bucket, path };
}

export type CaseImageUrl = { url: string | null; mime?: string | null; ext?: string | null };

export async function getCaseImageUrl(id: string): Promise<CaseImageUrl> {
  const supabase = getSupabaseServer();
  const { data: items, error } = await supabase.from("submissions").select("image_url").eq("id", id).limit(1);
  if (error) throw error;
  const imageUrl = items?.[0]?.image_url as string | undefined;
  const parsed = parseSupabaseUrl(imageUrl);
  if (!parsed) return { url: null };

  const { data: signed, error: sErr } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 3600);
  if (sErr) throw sErr;

  const url = signed?.signedUrl || null;
  const lowerPath = parsed.path.toLowerCase();
  const ext = lowerPath.endsWith(".png") ? "png"
    : lowerPath.endsWith(".jpg") ? "jpg"
    : lowerPath.endsWith(".jpeg") ? "jpeg"
    : lowerPath.endsWith(".gif") ? "gif"
    : lowerPath.endsWith(".webp") ? "webp"
    : lowerPath.endsWith(".pdf") ? "pdf"
    : "";
  const mime = ext === "png" ? "image/png"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "gif" ? "image/gif"
    : ext === "webp" ? "image/webp"
    : ext === "pdf" ? "application/pdf"
    : null;
  return { url, mime, ext };
}

export type CaseLandingUrl = { url: string | null; landingUrl: string | null; status: string | null; mime?: string | null };

export async function getCaseLandingUrl(id: string): Promise<CaseLandingUrl> {
  const supabase = getSupabaseServer();
  const { data: items, error } = await supabase
    .from("submissions")
    .select("landing_screenshot_url, landing_url, landing_render_status")
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  const row = items?.[0] as { landing_screenshot_url?: string | null; landing_url?: string | null; landing_render_status?: string | null } | undefined;
  const landingUrl = row?.landing_url || null;
  const status = row?.landing_render_status || null;
  const imageUrl = row?.landing_screenshot_url || null;
  if (!imageUrl) return { url: null, landingUrl, status };
  // Accept both supabase://bucket/path and raw https URLs
  if (imageUrl.startsWith("http")) return { url: imageUrl, landingUrl, status, mime: "image/png" };
  const parsed = parseSupabaseUrl(imageUrl);
  if (!parsed) return { url: null, landingUrl, status };
  const { data: signed, error: signErr } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 3600);
  if (signErr) throw signErr;
  return { url: signed?.signedUrl || null, landingUrl, status, mime: "image/png" };
}
