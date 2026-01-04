import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);
  const pageParam = searchParams.get("page");
  const offsetParam = searchParams.get("offset");
  const explicitOffset = offsetParam !== null ? Number(offsetParam) : null;
  const page = Math.max(Number(pageParam || 1) || 1, 1);
  const offset = explicitOffset !== null && Number.isFinite(explicitOffset) && explicitOffset >= 0 
    ? explicitOffset 
    : (page - 1) * limit;
  const q = (searchParams.get("q") || "").trim();
  const include = (searchParams.get("include") || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Support both repeated ?codes=AB001&codes=AB003 and comma-separated ?codes=AB001,AB003
  const multiCodes = searchParams.getAll("codes");
  const singleCodes = (searchParams.get("codes") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const codes = Array.from(new Set([...(multiCodes || []), ...(singleCodes || [])])).filter(Boolean);
  // Support both repeated ?senders=name1&senders=name2 and comma-separated ?senders=name1,name2
  const multiSenders = searchParams.getAll("senders");
  const singleSenders = (searchParams.get("senders") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const senders = Array.from(new Set([...(multiSenders || []), ...(singleSenders || [])])).filter(Boolean);
  // Support source filtering (user_submitted, bot_submitted)
  const multiSources = searchParams.getAll("sources");
  const singleSources = (searchParams.get("sources") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const sources = Array.from(new Set([...(multiSources || []), ...(singleSources || [])])).filter(Boolean);
  // Support filtering by message type (sms, email, mms, etc.)
  const multiTypes = searchParams.getAll("types");
  const singleTypes = (searchParams.get("types") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const types = Array.from(new Set([...(multiTypes || []), ...(singleTypes || [])])).filter(Boolean);

  try {
    const supabase = getSupabaseServer();
    type Row = {
      id: string;
      created_at: string;
      email_sent_at: string | null;
      sender_id: string | null;
      sender_name: string | null;
      raw_text: string | null;
      message_type: string | null;
      forwarder_email: string | null;
      image_url: string | null;
    };
    const sanitizedQuery = q.length > 0 ? q.replace(/[%]/g, "").replace(/,/g, " ") : null;
    const sendersFilter = senders.length > 0 ? senders.map((s) => JSON.stringify(s)).join(",") : null;

    const applyCommonFilters = <T extends {
      eq: (column: string, value: unknown) => T;
      or: (filters: string) => T;
      in: (column: string, values: unknown[]) => T;
    }>(builder: T): T => {
      let next = builder.eq("public", true);
      if (sanitizedQuery) {
        next = next.or(`sender_name.ilike.%${sanitizedQuery}%,sender_id.ilike.%${sanitizedQuery}%`);
      }
      if (sendersFilter) {
        next = next.or(`sender_name.in.(${sendersFilter}),sender_id.in.(${sendersFilter})`);
      }
      // Apply source filtering
      if (sources.length > 0) {
        const hasBotSubmitted = sources.includes("bot_submitted");
        const hasUserSubmitted = sources.includes("user_submitted");
        
        if (hasBotSubmitted && !hasUserSubmitted) {
          // Bot captured only: (sms with sender_id) OR (email without forwarder)
          next = next.or(`and(message_type.eq.sms,sender_id.not.is.null),and(message_type.eq.email,forwarder_email.is.null)`);
        } else if (hasUserSubmitted && !hasBotSubmitted) {
          // User submitted only: manual uploads OR (email with forwarder) OR SMS without sender_id OR other types
          // Manual uploads have image_url starting with 'supabase://'
          next = next.or(`image_url.like.supabase://*,and(message_type.eq.email,forwarder_email.not.is.null),and(message_type.eq.sms,sender_id.is.null),message_type.not.in.(email,sms)`);
        }
        // If both are selected, don't filter (show all)
      }

      // Apply message type filtering (e.g., email vs sms)
      if (types.length > 0) {
        next = next.in("message_type", types);
      }
      return next;
    };

    let items: Array<{
      id: string;
      createdAt: string;
      senderId: string | null;
      senderName: string | null;
      rawText: string | null;
      messageType: string | null;
      forwarderEmail: string | null;
      imageUrl: string | null;
    }> = [];
    let total = 0;

    // Check for special filter codes
    const hasAnyViolation = codes.includes("ANY_VIOLATION");
    const hasNoViolation = codes.includes("NO_VIOLATION");
    const specificCodes = codes.filter(c => c !== "ANY_VIOLATION" && c !== "NO_VIOLATION");

    if (hasAnyViolation || hasNoViolation || specificCodes.length > 0) {
      try {
        let ids: string[] = [];
        
        if (hasAnyViolation) {
          // Get all submissions that have at least one violation
          const { data: vioRows, error: vioErr } = await supabase
            .from("violations")
            .select("submission_id");
          if (vioErr) {
            console.error("/api/cases ANY_VIOLATION filter error", { error: vioErr });
            throw vioErr;
          }
          const idSet = new Set<string>();
          for (const r of vioRows || []) {
            const sid = String((r as { submission_id: string }).submission_id);
            if (sid) idSet.add(sid);
          }
          ids = Array.from(idSet);
          console.log(`/api/cases found ${ids.length} submissions with ANY_VIOLATION`);
        } else if (hasNoViolation) {
          // Get all submissions, then exclude those with violations
          const { data: allSubs, error: allErr } = await supabase
            .from("submissions")
            .select("id")
            .eq("public", true);
          if (allErr) {
            console.error("/api/cases NO_VIOLATION all submissions error", { error: allErr });
            throw allErr;
          }
          
          const { data: vioRows, error: vioErr } = await supabase
            .from("violations")
            .select("submission_id");
          if (vioErr) {
            console.error("/api/cases NO_VIOLATION violations error", { error: vioErr });
            throw vioErr;
          }
          
          const withViolations = new Set<string>();
          for (const r of vioRows || []) {
            const sid = String((r as { submission_id: string }).submission_id);
            if (sid) withViolations.add(sid);
          }
          
          ids = (allSubs || [])
            .map(s => String((s as { id: string }).id))
            .filter(id => !withViolations.has(id));
          console.log(`/api/cases found ${ids.length} submissions with NO_VIOLATION`);
        } else if (specificCodes.length > 0) {
          // Original behavior for specific codes
          const { data: vioRows, error: vioErr } = await supabase
            .from("violations")
            .select("submission_id, code")
            .in("code", specificCodes);
          if (vioErr) {
            console.error("/api/cases violation code filter error", { codes: specificCodes, error: vioErr });
            throw vioErr;
          }
          const idSet = new Set<string>();
          for (const r of vioRows || []) {
            const sid = String((r as { submission_id: string }).submission_id);
            if (sid) idSet.add(sid);
          }
          ids = Array.from(idSet);
          console.log(`/api/cases found ${ids.length} submissions for codes:`, specificCodes);
        }
        
      if (ids.length === 0) {
        return NextResponse.json({ items: [], total: 0, limit, offset, page, hasMore: false });
      }

        const chunkSize = 50;
        const rowMap = new Map<string, Row>();
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunkIds = ids.slice(i, i + chunkSize);
          let chunkBuilder = supabase
            .from("submissions")
            .select("id, created_at, email_sent_at, sender_id, sender_name, raw_text, message_type, forwarder_email, image_url");
          chunkBuilder = applyCommonFilters(chunkBuilder).in("id", chunkIds);
          const { data: chunkData, error: chunkError } = await chunkBuilder;
          if (chunkError) {
            console.error("/api/cases submissions chunk error", { codes, chunkSize: chunkIds.length, error: chunkError });
            throw chunkError;
          }
          for (const row of (chunkData || []) as Row[]) {
            rowMap.set(row.id, row);
          }
        }

        const combined = Array.from(rowMap.values()).sort((a, b) => {
          const aTime = new Date(a.email_sent_at || a.created_at).valueOf();
          const bTime = new Date(b.email_sent_at || b.created_at).valueOf();
          return bTime - aTime;
        });
        total = combined.length;
        const paged = combined.slice(offset, offset + limit);
        items = paged.map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          emailSentAt: r.email_sent_at,
          senderId: r.sender_id,
          senderName: r.sender_name,
          rawText: r.raw_text,
          messageType: r.message_type,
          forwarderEmail: r.forwarder_email,
          imageUrl: r.image_url,
        }));
      } catch (codeFilterErr) {
        console.error("/api/cases code filter exception", { codes, err: codeFilterErr });
        throw codeFilterErr;
      }
    } else {
      // For non-code-filtered queries, we need to fetch all matching results to sort by email_sent_at with fallback to created_at
      let builder = supabase
        .from("submissions")
        .select("id, created_at, email_sent_at, sender_id, sender_name, raw_text, message_type, forwarder_email, image_url", { count: "exact" });
      builder = applyCommonFilters(builder);

      // Get total count first (without pagination, to get exact count for sorting)
      const { data: allData, error: countError, count: totalCount } = await builder;
      if (countError) {
        console.error("/api/cases submissions query error", { codes, senders, q, error: countError });
        throw countError;
      }

      // Sort by email_sent_at (if exists) then created_at, descending
      const allRows = (allData || []) as Row[];
      const sortedRows = allRows.sort((a, b) => {
        const aTime = new Date(a.email_sent_at || a.created_at).valueOf();
        const bTime = new Date(b.email_sent_at || b.created_at).valueOf();
        return bTime - aTime;
      });

      // Apply pagination to sorted results
      const paged = sortedRows.slice(offset, offset + limit);
      items = paged.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        emailSentAt: r.email_sent_at,
        senderId: r.sender_id,
        senderName: r.sender_name,
        rawText: r.raw_text,
        messageType: r.message_type,
        forwarderEmail: r.forwarder_email,
        imageUrl: r.image_url,
      }));
      total = typeof totalCount === "number" ? totalCount : sortedRows.length;
    }

    // Optionally include top violations (deduped by code, max 3 per case)
    if (include.includes("top_violations") && items.length > 0) {
      try {
        type VRow = { submission_id: string; code?: string | null; title?: string | null; severity?: number | string | null; confidence?: number | string | null; actblue_verified?: boolean | null };
        const ids = items.map((i) => i.id);
        const { data: vioRows, error: vioErr } = await supabase
          .from("violations")
          .select("submission_id, code, title, severity, confidence, actblue_verified")
          .in("submission_id", ids);
        if (vioErr) {
          console.error("/api/cases top_violations query error", { ids: ids.length, error: vioErr });
          throw vioErr;
        }
        const byCase = new Map<string, Array<{ code: string; title: string; severity: number; confidence: number; actblue_verified?: boolean | null }>>();
        for (const v of (vioRows || []) as VRow[]) {
          const sid = String(v.submission_id);
          const code = typeof v.code === "string" ? v.code.trim() : "";
          const title = typeof v.title === "string" ? v.title.trim() : code || "Violation";
          const severity = Number(v.severity ?? 0) || 0;
          const confidence = Number(v.confidence ?? 0) || 0;
          if (!code) continue;
          const arr = byCase.get(sid) || [];
          arr.push({ code, title, severity, confidence, actblue_verified: v.actblue_verified });
          byCase.set(sid, arr);
        }
        items = items.map((it) => {
          const src = byCase.get(it.id) || [];
          const seen = new Set<string>();
          const top: Array<{ code: string; title: string; actblue_verified?: boolean | null }> = [];
          for (const v of src.sort((a, b) => b.severity - a.severity || b.confidence - a.confidence)) {
            if (seen.has(v.code)) continue;
            seen.add(v.code);
            top.push({ code: v.code, title: v.title, actblue_verified: v.actblue_verified });
            if (top.length >= 3) break;
          }
          return { ...it, issues: top } as typeof it & { issues: Array<{ code: string; title: string; actblue_verified?: boolean | null }> };
        });
      } catch {}
    }

    // Include report status for each case
    if (items.length > 0) {
      try {
        const ids = items.map((i) => i.id);
        const { data: reportRows } = await supabase
          .from("reports")
          .select("case_id")
          .in("case_id", ids);
        const reportedIds = new Set(reportRows?.map((r) => (r as { case_id: string }).case_id) || []);
        items = items.map((it) => ({ ...it, hasReport: reportedIds.has(it.id) }));
      } catch {}
    }
    if (codes.length > 0 && total === 0) {
      total = offset + items.length;
    }
    const hasMore = offset + items.length < total;
    return NextResponse.json({ items, total, limit, offset, page, hasMore });
  } catch (err) {
    console.error("/api/cases supabase error", err);
    return NextResponse.json({ items: [], total: 0, limit, offset, page, hasMore: false, error: "unavailable" });
  }
}

