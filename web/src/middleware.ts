import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function rateLimitResponse(resetMs: number) {
  return NextResponse.json(
    { error: { code: "rate_limited", message: "Too many requests. Try again later." } },
    {
      status: 429,
      headers: { ...CORS_HEADERS, "Retry-After": String(Math.ceil(resetMs / 1000)) },
    }
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/v1/")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    const ip = getClientIp(req.headers);

    // 10 failed-or-not auth attempts per minute per IP across all v1 endpoints
    const authResult = rateLimit("api_v1_ip", ip, 60, 60_000);
    if (!authResult.allowed) {
      return rateLimitResponse(authResult.resetMs);
    }

    // Per-API-key throttle: extract key from header and limit to 200 req/min
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const keyPrefix = authHeader.slice(7, 15);
      const keyResult = rateLimit("api_v1_key", keyPrefix, 200, 60_000);
      if (!keyResult.allowed) {
        return rateLimitResponse(keyResult.resetMs);
      }
    }

    return NextResponse.next();
  }

  if (pathname === "/api/api-key-request") {
    const ip = getClientIp(req.headers);
    const result = rateLimit("key_request", ip, 5, 60_000);
    if (!result.allowed) {
      return rateLimitResponse(result.resetMs);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/v1/:path*", "/api/api-key-request"],
};
