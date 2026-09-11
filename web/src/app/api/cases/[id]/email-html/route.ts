import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  if (!id) {
    return new NextResponse("Missing case ID", { status: 400 });
  }

  const supabase = getSupabaseServer();

  // Fetch submission's email_body
  const { data: rows, error } = await supabase
    .from("submissions")
    .select("email_body, message_type")
    .eq("id", id)
    .limit(1);

  if (error || !rows?.[0]) {
    return new NextResponse("Case not found", { status: 404 });
  }

  const sub = rows[0] as { email_body?: string | null; message_type?: string | null };

  if (!sub.email_body) {
    return new NextResponse("No email HTML available for this case", { 
      status: 404,
      headers: { "Content-Type": "text/plain" }
    });
  }

  // Return the raw HTML with strict CSP to prevent XSS
  return new NextResponse(sub.email_body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline' https:; font-src https: data:; frame-ancestors 'none';",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

