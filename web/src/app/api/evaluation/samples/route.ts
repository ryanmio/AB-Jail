/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * Check if URL is an image file (not PDF or other formats)
 */
function isImageFile(url: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.png') || 
         lower.endsWith('.jpg') || 
         lower.endsWith('.jpeg') || 
         lower.endsWith('.gif') || 
         lower.endsWith('.webp') ||
         lower.includes('.png?') ||
         lower.includes('.jpg?') ||
         lower.includes('.jpeg?') ||
         lower.includes('.gif?') ||
         lower.includes('.webp?');
}

/**
 * Convert supabase:// URL to signed URL (only for valid image files)
 */
async function convertToSignedUrl(supabase: any, url: string | null): Promise<string | null> {
  if (!url) return null;
  
  // Check if it's an image file before processing
  if (!isImageFile(url)) return null;
  
  // If already an HTTP URL, return as-is
  if (url.startsWith("http")) return url;
  
  // Parse supabase:// URLs
  if (!url.startsWith("supabase://")) return null;
  
  const rest = url.replace("supabase://", "");
  const [bucket, ...pathParts] = rest.split("/");
  const path = pathParts.join("/");
  
  if (!bucket || !path) return null;
  
  try {
    const { data: signed } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(path, 3600); // 1 hour expiry
    
    return signed?.signedUrl || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/evaluation/samples
 * Returns random submissions with AI-detected violations for evaluation
 * Query params:
 *   - count: number of samples to return (default: 20)
 *   - exclude: comma-separated submission IDs to exclude (already evaluated)
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  const { searchParams } = new URL(req.url);
  
  const count = Math.min(50, Math.max(1, parseInt(searchParams.get("count") || "20", 10)));
  const excludeParam = searchParams.get("exclude") || "";
  const excludeIds = excludeParam ? excludeParam.split(",").filter(Boolean) : [];

  try {
    // Get random submissions that are completed and public
    let query = supabase
      .from("submissions")
      .select("id, image_url, sender_id, sender_name, raw_text, message_type, ai_confidence, created_at, landing_url, landing_screenshot_url, email_body, email_subject")
      .eq("processing_status", "done")
      .eq("public", true)
      .not("raw_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(200); // Get more than needed for randomization

    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data: submissions, error: submissionsError } = await query;

    if (submissionsError) {
      console.error("/api/evaluation/samples: submissions error", submissionsError);
      return NextResponse.json({ error: "database_error" }, { status: 500 });
    }

    if (!submissions || submissions.length === 0) {
      return NextResponse.json({ samples: [] });
    }

    // Shuffle and take requested count
    const shuffled = submissions.sort(() => Math.random() - 0.5).slice(0, count);
    const submissionIds = shuffled.map((s) => s.id);

    // Get violations for these submissions
    const { data: violations, error: violationsError } = await supabase
      .from("violations")
      .select("submission_id, code, title, description, confidence")
      .in("submission_id", submissionIds);

    if (violationsError) {
      console.error("/api/evaluation/samples: violations error", violationsError);
      return NextResponse.json({ error: "database_error" }, { status: 500 });
    }

    // Group violations by submission
    const violationsBySubmission: Record<string, any[]> = {};
    (violations || []).forEach((v) => {
      if (!violationsBySubmission[v.submission_id]) {
        violationsBySubmission[v.submission_id] = [];
      }
      violationsBySubmission[v.submission_id].push({
        code: v.code,
        title: v.title,
        description: v.description,
        confidence: v.confidence,
      });
    });

    // Convert supabase:// URLs to signed URLs
    const samplesWithSignedUrls = await Promise.all(
      shuffled.map(async (sub) => ({
        id: sub.id,
        imageUrl: await convertToSignedUrl(supabase, sub.image_url),
        senderId: sub.sender_id,
        senderName: sub.sender_name,
        rawText: sub.raw_text,
        messageType: sub.message_type,
        aiConfidence: sub.ai_confidence,
        createdAt: sub.created_at,
        landingUrl: sub.landing_url,
        landingScreenshotUrl: await convertToSignedUrl(supabase, sub.landing_screenshot_url),
        emailBody: sub.email_body || null,
        emailSubject: sub.email_subject || null,
        // email_from is the raw From/envelope line and can encode the recipient; show the resolved sender name instead.
        emailFrom: sub.sender_name || null,
        aiViolations: violationsBySubmission[sub.id] || [],
      }))
    );

    return NextResponse.json({ samples: samplesWithSignedUrls });
  } catch (error) {
    console.error("/api/evaluation/samples: error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

