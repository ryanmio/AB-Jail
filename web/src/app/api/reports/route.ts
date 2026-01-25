import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ReportRow = {
  id: string;
  case_id: string;
  to_email: string;
  cc_email: string | null;
  subject: string;
  body: string;
  screenshot_url: string | null;
  landing_url: string;
  status: string;
  created_at: string;
};

type CaseRow = {
  id: string;
  sender_name: string | null;
  sender_id: string | null;
  raw_text: string | null;
  image_url: string | null;
  created_at: string | null;
  message_type: string | null;
  email_body: string | null;
};

type VerdictRow = {
  id: string;
  case_id: string;
  verdict: string;
  explanation: string | null;
  determined_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ViolationRow = {
  submission_id: string;
  code: string;
  title: string;
  actblue_verified?: boolean | null;
};

type ReportWithVerdict = {
  report: ReportRow;
  case: CaseRow;
  verdict: VerdictRow | null;
  violations: Array<{
    code: string;
    title: string;
    actblue_verified?: boolean | null;
  }>;
};

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    
    // Fetch all reports ordered by creation date (newest first)
    const { data: reportRows, error: reportError } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (reportError) throw reportError;
    
    if (!reportRows || reportRows.length === 0) {
      return NextResponse.json({ reports: [] });
    }
    
    // Get unique case IDs
    const caseIds = Array.from(new Set((reportRows as ReportRow[]).map((r) => r.case_id)));
    
    // Fetch case data (only public cases)
    const { data: caseRows, error: caseError } = await supabase
      .from("submissions")
      .select("id, sender_name, sender_id, raw_text, image_url, created_at, message_type, email_body")
      .in("id", caseIds)
      .eq("public", true);
    
    if (caseError) throw caseError;
    
    // Fetch verdicts
    const { data: verdictRows, error: verdictError } = await supabase
      .from("report_verdicts")
      .select("*")
      .in("case_id", caseIds);
    
    if (verdictError) throw verdictError;
    
    // Fetch violations for all cases
    const { data: violationRows, error: violationError } = await supabase
      .from("violations")
      .select("submission_id, code, title, actblue_verified")
      .in("submission_id", caseIds);
    
    if (violationError) throw violationError;
    
    // Build lookup maps
    const casesMap = new Map((caseRows as CaseRow[] || []).map((c) => [c.id, c]));
    const verdictsMap = new Map((verdictRows as VerdictRow[] || []).map((v) => [v.case_id, v]));
    const violationsMap = new Map<string, Array<{ code: string; title: string; actblue_verified?: boolean | null }>>();
    
    for (const v of (violationRows as ViolationRow[]) || []) {
      const caseId = v.submission_id;
      if (!violationsMap.has(caseId)) {
        violationsMap.set(caseId, []);
      }
      violationsMap.get(caseId)!.push({
        code: v.code,
        title: v.title,
        actblue_verified: v.actblue_verified,
      });
    }
    
    // Build response
    const reports: ReportWithVerdict[] = (reportRows as ReportRow[] || []).map((r) => {
      const caseData = casesMap.get(r.case_id);
      const verdict = verdictsMap.get(r.case_id) || null;
      const violations = violationsMap.get(r.case_id) || [];
      
      return {
        report: {
          id: r.id,
          case_id: r.case_id,
          to_email: r.to_email,
          cc_email: r.cc_email,
          subject: r.subject,
          body: r.body,
          screenshot_url: r.screenshot_url,
          landing_url: r.landing_url,
          status: r.status,
          created_at: r.created_at,
        },
        case: caseData ? {
          id: caseData.id,
          sender_name: caseData.sender_name,
          sender_id: caseData.sender_id,
          raw_text: caseData.raw_text,
          image_url: caseData.image_url,
          created_at: caseData.created_at,
          message_type: caseData.message_type,
          email_body: caseData.email_body,
        } : {
          id: r.case_id,
          sender_name: null,
          sender_id: null,
          raw_text: null,
          image_url: null,
          created_at: null,
          message_type: null,
          email_body: null,
        },
        verdict: verdict ? {
          id: verdict.id,
          case_id: verdict.case_id,
          verdict: verdict.verdict,
          explanation: verdict.explanation,
          determined_by: verdict.determined_by,
          created_at: verdict.created_at,
          updated_at: verdict.updated_at,
        } : null,
        violations,
      };
    });
    
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("/api/reports:error", err);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

