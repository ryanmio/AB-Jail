import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export interface ApiKeyRecord {
  id: string;
  key_prefix: string;
  name: string;
  email: string;
  is_active: boolean;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Validates an API key from the request and returns the key record.
 * Returns a NextResponse error if the key is missing or invalid.
 */
export async function authenticateApiKey(
  req: NextRequest
): Promise<ApiKeyRecord | NextResponse> {
  const authHeader = req.headers.get("authorization");

  let rawKey: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    rawKey = authHeader.slice(7).trim();
  }

  if (!rawKey) {
    return errorResponse(
      "unauthorized",
      "Missing API key. Provide via Authorization: Bearer <key> header.",
      401
    );
  }

  const hash = hashKey(rawKey);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, email, is_active")
      .eq("key_hash", hash)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error || !data) {
      return errorResponse("unauthorized", "Invalid or revoked API key.", 401);
    }

    void supabase
      .rpc("increment_api_key_usage", { key_id: data.id })
      .then(() => {}, () => {});

    return data as ApiKeyRecord;
  } catch {
    return errorResponse("internal_error", "Failed to validate API key.", 500);
  }
}

export function isAuthError(
  result: ApiKeyRecord | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
