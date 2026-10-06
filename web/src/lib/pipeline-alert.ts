import { Resend } from "resend";
import { env } from "@/lib/env";

// At most one email per step + error code in each window.
const WINDOW_MS = 6 * 60 * 60 * 1000;
const lastSent = new Map<string, number>();

type OpenAIErrorBody = { error?: { message?: string; type?: string; code?: string | null } } | null | undefined;

/**
 * Email the site admin when a pipeline step fails. Never throws.
 */
export async function alertPipelineFailure(opts: {
  step: string;
  submissionId?: string | null;
  status?: number | null;
  detail?: unknown;
}): Promise<void> {
  try {
    const to = env.ALERT_EMAIL_TO || env.DATA_REQUEST_EMAIL;
    if (!env.RESEND_API_KEY || !to) return;

    const err = (opts.detail as OpenAIErrorBody)?.error;
    const code = String(err?.code || err?.type || opts.status || "unknown");
    const key = `${opts.step}/${code}`;
    const bucket = Math.floor(Date.now() / WINDOW_MS);
    if (lastSent.get(key) === bucket) return;
    lastSent.set(key, bucket);

    const detailText = typeof opts.detail === "string" ? opts.detail : JSON.stringify(opts.detail ?? null, null, 2);
    const text = [
      `Pipeline step failed: ${opts.step}`,
      `Error: ${code}${err?.message ? ` - ${err.message}` : ""}`,
      opts.status ? `HTTP status: ${opts.status}` : null,
      opts.submissionId ? `Submission: ${env.NEXT_PUBLIC_SITE_URL}/cases/${opts.submissionId}` : null,
      "",
      "Further failures of this kind are suppressed for up to 6 hours.",
      "Affected submissions stay in the error state until reprocessed (scripts/reprocess-failed.ts).",
      "",
      String(detailText).slice(0, 2000),
    ].filter((l) => l !== null).join("\n");

    const resend = new Resend(env.RESEND_API_KEY);
    // The idempotency key dedupes across serverless instances.
    const { error } = await resend.emails.send(
      {
        from: "AB Jail <notifications@abjail.org>",
        to,
        subject: `[AB Jail] ${opts.step} failing: ${code}`,
        text,
      },
      { idempotencyKey: `pipeline-alert/${key}/${bucket}` }
    );
    if (error) console.error("pipeline-alert:send_failed", JSON.stringify(error));
  } catch (e) {
    console.error("pipeline-alert:error", String(e));
  }
}
