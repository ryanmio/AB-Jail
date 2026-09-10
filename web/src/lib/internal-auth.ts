import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

/**
 * Shared-secret guard for routes that only the server itself should call
 * (classification, sender detection, PII redaction, outbound email, etc.).
 * These run with the service-role key, so without a guard anyone on the
 * internet could overwrite any case and burn OpenAI/Resend quota.
 */
export const INTERNAL_SECRET_HEADER = "x-internal-secret";

export function internalHeaders(): Record<string, string> {
  const secret = env.INTERNAL_API_SECRET;
  return secret ? { [INTERNAL_SECRET_HEADER]: secret } : {};
}

export function requireInternalSecret(req: NextRequest): NextResponse | null {
  const expected = env.INTERNAL_API_SECRET;
  if (!expected) {
    console.error("internal-auth: INTERNAL_API_SECRET is not set; denying request", {
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const provided = req.headers.get(INTERNAL_SECRET_HEADER) || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    console.warn("internal-auth: rejected request", { path: req.nextUrl.pathname });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
