import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export interface PaginationParams {
  limit: number;
  offset: number;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  return { limit, offset };
}

export function paginatedResponse(
  data: unknown[],
  total: number,
  params: PaginationParams
) {
  return NextResponse.json({
    data,
    pagination: {
      total,
      limit: params.limit,
      offset: params.offset,
      has_more: params.offset + data.length < total,
    },
  });
}

export function singleResponse(data: unknown) {
  return NextResponse.json({ data });
}

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isImageFile(url: string): boolean {
  const lower = url.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp"].some((ext) =>
    lower.endsWith(ext)
  );
}

/**
 * Converts a supabase:// internal URL to a signed URL.
 * Returns the original URL if it's already an http(s) URL.
 * Returns null for non-image files or on failure.
 */
export async function resolveImageUrl(
  supabase: SupabaseClient,
  url: string | null | undefined
): Promise<string | null> {
  if (!url) return null;

  if (url.startsWith("http")) return url;

  if (!url.startsWith("supabase://")) return null;
  if (!isImageFile(url)) return null;

  const rest = url.replace("supabase://", "");
  const [bucket, ...pathParts] = rest.split("/");
  const path = pathParts.join("/");
  if (!bucket || !path) return null;

  try {
    const { data: signed } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    return signed?.signedUrl || null;
  } catch {
    return null;
  }
}

/**
 * Resolve multiple image URLs in parallel for a batch of records.
 */
export async function resolveImageUrls(
  supabase: SupabaseClient,
  records: Array<{ image_url?: string | null; landing_screenshot_url?: string | null }>
): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const record of records) {
    if (record.image_url) {
      promises.push(
        resolveImageUrl(supabase, record.image_url).then((url) => {
          record.image_url = url;
        })
      );
    }
    if (record.landing_screenshot_url) {
      promises.push(
        resolveImageUrl(supabase, record.landing_screenshot_url).then((url) => {
          record.landing_screenshot_url = url;
        })
      );
    }
  }

  await Promise.all(promises);
}

/**
 * Extracts a comma-separated or repeated query parameter as a string array.
 */
export function parseArrayParam(
  searchParams: URLSearchParams,
  key: string
): string[] {
  const multi = searchParams.getAll(key);
  const combined = multi.flatMap((v) =>
    v.split(",").map((s) => s.trim()).filter(Boolean)
  );
  return Array.from(new Set(combined));
}
