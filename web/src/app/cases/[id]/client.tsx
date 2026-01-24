"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { Gallery, Item } from "react-photoswipe-gallery";
import LocalTime from "@/components/LocalTime";
import ReviewAnimation from "@/components/review-animation";
import { LandingPageScanner } from "@/components/landing-page-scanner";
import { EmailSuccessAnimation } from "@/components/email-success-animation";
import { repairMojibake, normalizePunctuation } from "@/server/ingest/text-cleaner";

function Tooltip({ label, children }: { label?: string; children: React.ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <span className="relative inline-block group">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden whitespace-nowrap rounded bg-slate-900 text-white text-xs px-2 py-1 shadow group-hover:block">
        {label}
      </span>
    </span>
  );
}

type Props = {
  id: string;
  initialText: string | null;
  initialStatus: string | null | undefined;
};

export function LiveCaseText({ id, initialText, initialStatus }: Props) {
  const [text, setText] = useState<string | null>(initialText);
  const [status, setStatus] = useState<string | null | undefined>(initialStatus);

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const item = data.item as { raw_text: string | null; processing_status?: string | null };
        if (!cancelled) {
          const raw = item?.raw_text ?? null;
          // Best-effort: repair mojibake for display, mirroring server-side cleaning
          const cleaned = raw ? normalizePunctuation(repairMojibake(raw)) : null;
          setText(cleaned);
          setStatus(item?.processing_status ?? null);
          if (raw && item?.processing_status === "done") {
            clearInterval(interval);
          }
        }
      } catch {}
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, initialStatus]);

  return (
    <div>
      <div className="whitespace-pre-wrap text-sm bg-white border rounded p-3 min-h-24">
        {text || "(no text yet)"}
      </div>
      {(!text || status !== "done") && (
        <div className="text-xs text-gray-500 mt-1">Processing… this will update automatically.</div>
      )}
    </div>
  );
}

type Violation = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  severity?: number | null;
  confidence?: string | number | null;
  actblue_verified?: boolean | null;
};

type LiveViolationsProps = {
  id: string;
  initialViolations: Array<Violation>;
  initialStatus: string | null | undefined;
  initialAiConfidence?: number | string | null;
};

export function LiveViolations({ id, initialViolations, initialStatus, initialAiConfidence }: LiveViolationsProps) {
  const [violations, setViolations] = useState<Array<Violation>>(initialViolations);
  const [status, setStatus] = useState<string | null | undefined>(initialStatus);
  const [overallConfidence, setOverallConfidence] = useState<number | null>(initialAiConfidence == null ? null : Number(initialAiConfidence));
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set());
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    // Set 2-minute timeout
    timeoutRef.current = window.setTimeout(() => {
      stopPolling();
    }, 120000);

    intervalRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const item = data.item as { processing_status?: string | null; ai_confidence?: number | string | null };
        const vios = (data.violations ?? []) as Array<Violation>;
        setViolations(vios);
        setStatus(item?.processing_status ?? null);
        const oc = item?.ai_confidence;
        setOverallConfidence(oc == null ? null : Number(oc));
        if (item?.processing_status === "done") {
          stopPolling();
        }
      } catch {}
    }, 2000);
  }, [id, stopPolling]);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [id, startPolling, stopPolling]);

  useEffect(() => {
    const onReclassify = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (!detail || detail.id !== id) return;
      setStatus("classified");
      startPolling();
    };
    window.addEventListener("reclassify-started", onReclassify as EventListener);
    return () => window.removeEventListener("reclassify-started", onReclassify as EventListener);
  }, [id, startPolling]);

  if (status !== "done") {
    return (
      <div className="space-y-4">
       
        <ReviewAnimation />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {overallConfidence != null && (
        <div className="text-sm text-slate-600">
          Overall AI confidence: <span className="font-semibold text-slate-900">{(Number(overallConfidence) * 100).toFixed(0)}%</span>
        </div>
      )}

      {violations.length === 0 ? (
        <div className="p-4 bg-slate-50 rounded-xl text-center">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-slate-600">No violations detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {violations.map((v) => {
            const confidenceNum = v.confidence == null ? null : Number(v.confidence);
            const severityNum = v.severity == null ? null : Number(v.severity);
            const isVerified = v.actblue_verified === true;
            const isExpanded = expandedViolations.has(v.id);
            
            // Color coding based on severity
            const severityColors = {
              1: "bg-yellow-50 border-l-yellow-400 text-yellow-800",
              2: "bg-yellow-50 border-l-yellow-400 text-yellow-800", 
              3: "bg-orange-50 border-l-orange-400 text-orange-800",
              4: "bg-red-50 border-l-red-400 text-red-800",
              5: "bg-red-50 border-l-red-500 text-red-900"
            };
            
            const colorClass = severityColors[severityNum as keyof typeof severityColors] || "bg-slate-50 border-l-slate-400 text-slate-800";
            
            // If ActBlue verified, show the permitted card
            if (isVerified) {
              return (
                <div key={v.id} className="p-4 rounded-xl border-l-4 bg-blue-50 border-l-blue-400 text-blue-900">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-3 flex-wrap min-w-0">
                      <span className="inline-flex items-center bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-md shrink-0 border border-blue-200">
                        Likely Documented
                      </span>
                      <h3 className="font-semibold leading-snug break-words max-w-full min-w-0 text-blue-900">
                        Matching Program Documented
                      </h3>
                    </div>
                  </div>
                  
                  <p className="text-sm leading-relaxed mb-3 text-blue-800">
                    Based on evidence patterns we&apos;ve observed, this sender appears to meet ActBlue&apos;s standards for donation matching programs.
                  </p>
                  
                  <button
                    onClick={() => setExpandedViolations(prev => {
                      const next = new Set(prev);
                      if (next.has(v.id)) next.delete(v.id);
                      else next.add(v.id);
                      return next;
                    })}
                    className="text-xs text-blue-700 hover:text-blue-900 underline font-semibold"
                  >
                    {isExpanded ? '▼ Hide' : '▶ Show'} AI Detection Details
                  </button>
                  
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <div className="text-xs mb-2 text-blue-700">
                        <span className="font-semibold">{v.code}</span> - {v.title}
                      </div>
                      {confidenceNum != null && !Number.isNaN(confidenceNum) && (
                        <div className="text-xs mb-2 text-blue-700">
                          AI Confidence: <span className="font-semibold">{(confidenceNum * 100).toFixed(0)}%</span>
                        </div>
                      )}
                      {v.description && (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap text-blue-800 bg-blue-100 p-2 rounded">
                          {v.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            
            // Otherwise show as normal violation
            return (
              <div key={v.id} className={`p-4 rounded-xl border-l-4 ${colorClass}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3 flex-wrap min-w-0">
                    <span className="inline-flex items-center bg-white/60 text-current text-xs font-bold px-2 py-1 rounded-md shrink-0">
                      {v.code}
                    </span>
                    <h3 className="font-semibold leading-snug break-words max-w-full min-w-0">
                      {v.title}
                    </h3>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 text-xs mb-3 opacity-80">
                  {confidenceNum != null && !Number.isNaN(confidenceNum) && (
                    <div className="flex items-center gap-1">
                      <span>Confidence:</span>
                      <span className="font-semibold">{(confidenceNum * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
                
                {v.description && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap opacity-90">
                    {v.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type LiveSenderProps = {
  id: string;
  initialSenderName: string | null;
  initialSenderId: string | null;
};

export function LiveSender({ id, initialSenderName, initialSenderId }: LiveSenderProps) {
  const [senderName, setSenderName] = useState<string | null>(initialSenderName);
  const [senderId, setSenderId] = useState<string | null>(initialSenderId);
  const [isDone, setIsDone] = useState<boolean>(false);

  // Listen for reclassify-started event (fired when landing page screenshot captured)
  // Reset state to trigger re-polling for updated sender name
  useEffect(() => {
    const onReclassify = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === id) {
        setSenderName(null); // clear to trigger re-polling
        setIsDone(false);    // show spinner
      }
    };
    window.addEventListener("reclassify-started", onReclassify as EventListener);
    return () => window.removeEventListener("reclassify-started", onReclassify as EventListener);
  }, [id]);

  useEffect(() => {
    if (senderName) return; // nothing to poll if we already have it
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const item = data.item as { sender_name: string | null; sender_id: string | null; processing_status?: string | null } | null;
        if (!cancelled && item) {
          if (item.sender_name) {
            setSenderName(item.sender_name);
            clearInterval(interval);
            setIsDone(true);
          } else if (item.sender_id && !senderId) {
            setSenderId(item.sender_id);
          }
          // Stop polling when processing is done, regardless of sender info
          // AI has responded - accept the result (even if sender_name is null)
          if (item.processing_status === "done") {
            setIsDone(true);
            clearInterval(interval);
          }
        }
      } catch {}
    }, 2000);
    const timeout = setTimeout(() => {
      cancelled = true;
      clearInterval(interval);
      // After timeout, show unknown if we still don't have sender info
      setIsDone(true);
    }, 120000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [id, senderName, senderId]);

  if (senderName) return <>{senderName}</>;
  if (senderId) return <>{senderId}</>;
  if (isDone) return <>Unknown Sender</>;
  return (
    <span className="inline-flex items-center gap-2 text-slate-700">
      <span className="h-4 w-4 inline-block rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" aria-label="Loading" />
      <span>Identifying sender…</span>
    </span>
  );
}

type LiveSummaryProps = {
  id: string;
  initialSummary: string | null;
  initialStatus: string | null | undefined;
};

export function LiveSummary({ id, initialSummary, initialStatus }: LiveSummaryProps) {
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [status, setStatus] = useState<string | null | undefined>(initialStatus);
  const [hasNoViolations, setHasNoViolations] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const item = data.item as { processing_status?: string | null } | null;
        const vios = (data.violations ?? []) as Array<{ description?: string | null; severity?: number | null; confidence?: number | string | null }>;
        const serverSummary: string | null | undefined = (data as { summary?: string | null }).summary;
        if (!cancelled) {
          setStatus(item?.processing_status ?? null);
          setHasNoViolations(Array.isArray(vios) && vios.length === 0);
          if (serverSummary != null) {
            setSummary(serverSummary);
          } else {
            const sorted = [...vios].sort((a, b) => (Number(b.severity || 0) - Number(a.severity || 0)) || (Number(b.confidence || 0) - Number(a.confidence || 0)));
            setSummary(sorted[0]?.description ?? null);
          }
          if (item?.processing_status === "done") {
            clearInterval(interval);
          }
        }
      } catch {}
    }, 2000);
    const timeout = setTimeout(() => {
      cancelled = true;
      clearInterval(interval);
    }, 120000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [id, initialStatus]);

  const textOut = status === "done" && hasNoViolations ? "No violations detected" : (summary || "Analysis in progress...");
  return (
    <p className="text-slate-700 text-base leading-relaxed">{textOut}</p>
  );
}

type Report = { id: string; subject: string; body: string; created_at?: string | null; status?: string | null };
type ReportReply = { id: string; report_id: string | null; from_email: string | null; body_text: string | null; created_at?: string | null };
type ReportThreadProps = {
  id: string;
  verdict?: Verdict | null;
};
export function ReportThread({ id, verdict }: ReportThreadProps) {
  const [reports, setReports] = useState<Array<Report>>([]);
  const [replies, setReplies] = useState<Array<ReportReply>>([]);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  
  const loadReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const reportsData = (data.reports || []) as Array<Report>;
      setReports(reportsData.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()));
      setReplies((data.report_replies || []) as Array<ReportReply>);
    } catch {}
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const reportsData = (data.reports || []) as Array<Report>;
          setReports(reportsData.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()));
          setReplies((data.report_replies || []) as Array<ReportReply>);
        }
      } catch {}
    };
    void load();
    return () => { cancelled = true; };
  }, [id]);

  // Listen for report-sent events and refresh
  useEffect(() => {
    const onReportSent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (!detail || detail.id !== id) return;
      // Wait a moment for the backend to process, then refresh
      setTimeout(() => {
        void loadReports();
      }, 500);
    };
    window.addEventListener("report-sent", onReportSent as EventListener);
    return () => window.removeEventListener("report-sent", onReportSent as EventListener);
  }, [id, loadReports]);

  const repliesByReport = new Map<string, Array<ReportReply>>();
  for (const r of replies) {
    const key = r.report_id || "";
    if (!repliesByReport.has(key)) repliesByReport.set(key, []);
    repliesByReport.get(key)!.push(r);
  }

  const getVerdictLabel = (verdictType: string) => {
    switch (verdictType) {
      case 'no_violation': return 'No Violation';
      case 'violation_confirmed': return 'Violation Confirmed';
      case 'resolved': return 'Resolved';
      case 'under_review': return 'Under Review';
      default: return 'Pending';
    }
  };

  if (reports.length === 0 && replies.length === 0 && !verdict) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-black/5 p-6 md:p-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Report History</h2>
        <div className="text-sm text-slate-600">No reports submitted yet.</div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-black/5 p-6 md:p-8">
      <h2 className="text-xl font-semibold text-slate-900 mb-4">Report History</h2>
      <div className="space-y-4">
        {verdict && (
          <div className="border rounded-xl bg-slate-50">
            <div className="px-4 py-3">
              <div className="text-sm font-medium text-slate-900">ActBlue Decision: {getVerdictLabel(verdict.verdict)}</div>
              {verdict.created_at && (
                <div className="text-xs text-slate-600 mt-0.5"><LocalTime iso={verdict.created_at} options={{ year: "numeric", month: "short", day: "numeric" }} /></div>
              )}
            </div>
            {verdict.explanation && (
              <div className="px-4 pb-4">
                <div className="text-sm text-slate-800">{verdict.explanation}</div>
                {verdict.determined_by && (
                  <div className="text-xs text-slate-600 mt-2">
                    Determined by: {verdict.determined_by}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {[...reports].map((r) => {
          const open = !!openIds[r.id];
          const toggle = () => setOpenIds((s) => ({ ...s, [r.id]: !s[r.id] }));
          return (
            <div key={r.id} className="border rounded-xl bg-slate-50">
              <button
                type="button"
                onClick={toggle}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">{r.subject}</div>
                  {r.created_at && (
                    <div className="text-xs text-slate-600 mt-0.5"><LocalTime iso={r.created_at} /></div>
                  )}
                </div>
                <div className="text-xs text-slate-600 shrink-0">{r.status || "sent"} {open ? "▲" : "▼"}</div>
              </button>
              {open && (
                <div className="px-4 pb-4">
                  {r.body && (
                    <div className="mt-2">
                      {/* Structured rendering to mirror email sections */}
                      {renderReportBody(r.body)}
                    </div>
                  )}
                  {(repliesByReport.get(r.id) || []).length > 0 && (
                    <div className="mt-3 pl-3 border-l-2 border-slate-200 space-y-2">
                      {(repliesByReport.get(r.id) || []).map((rp) => (
                        <div key={rp.id} className="bg-white rounded-lg border p-3">
                          <div className="text-xs text-slate-600 mb-1">
                            From: {rp.from_email || "(unknown)"} {rp.created_at && (<><span className="mx-1">·</span><LocalTime iso={rp.created_at} /></>)}
                          </div>
                          <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{rp.body_text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderReportBody(body: string) {
  const lines = String(body).split(/\r?\n/);
  const findSection = (title: string) => {
    const idx = lines.findIndex((l) => l.trim().toLowerCase() === title.toLowerCase());
    if (idx === -1) return [] as string[];
    // skip underline line right after title if present
    let start = idx + 1;
    if (lines[start] && /^[-_]{3,}$/.test(lines[start].trim())) start++;
    const nextTitleIdx = lines.findIndex((l, i) => i > idx && /^(Campaign\/Org|Original message received on|Submission Date|Summary|Violations|Landing page URL|Landing page|Email HTML|Reporter note|Screenshot|Meta)\s*$/i.test(l.trim()));
    const end = nextTitleIdx === -1 ? lines.length : nextTitleIdx;
    return lines.slice(start, end);
  };

  const sec = {
    campaign: findSection("Campaign/Org"),
    submissionDate: findSection("Original message received on"),
    summary: findSection("Summary"),
    violations: findSection("Violations"),
    landing: findSection("Landing page URL"),
    screenshot: findSection("Screenshot"),
    meta: findSection("Meta"),
    note: findSection("Reporter note"),
  };


  const landingUrl = sec.landing.join(" ").trim();
  const screenshotUrl = sec.screenshot.join(" ").trim();

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">Campaign/Org</div>
        <div className="text-sm text-slate-800 whitespace-pre-wrap">{sec.campaign.join("\n").trim() || "(unknown)"}</div>
      </div>
      {sec.submissionDate.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Original message received on</div>
          <div className="text-sm text-slate-800 whitespace-pre-wrap">{sec.submissionDate.join("\n").trim()}</div>
        </div>
      )}
      {/* Summary removed */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">Violations</div>
        <div className="text-sm text-slate-800 whitespace-pre-wrap">
          {sec.violations.length > 0 ? sec.violations.map((l, i) => (
            <div key={`${l}-${i}`} className="break-words">{l}</div>
          )) : "(none)"}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1">Landing page</div>
        {landingUrl ? (
          <a href={landingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">{landingUrl}</a>
        ) : (
          <div className="text-sm text-slate-800">(none)</div>
        )}
      </div>
      {sec.note.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Reporter note</div>
          <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{sec.note.join("\n").trim()}</div>
        </div>
      )}
      {screenshotUrl && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Screenshot</div>
          <a href={screenshotUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">Screenshot</a>
        </div>
      )}
      {sec.meta.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-1">Meta</div>
          <div className="text-xs text-slate-700 whitespace-pre-wrap break-words">{sec.meta.join("\n").trim()}</div>
        </div>
      )}
    </div>
  );
}

type RequestDeletionButtonProps = {
  id: string;
  disabled?: boolean;
};

export function RequestDeletionButton({ id, disabled }: RequestDeletionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${id}/request-deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to submit request");
      }
      setSubmitted(true);
      setReason("");
      setTimeout(() => router.replace("/"), 1200);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to submit request";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitted) {
      router.replace("/");
    } else {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border ${disabled ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"}`}
        aria-label="Request deletion"
      >
        Request deletion
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex items-start sm:items-center justify-center p-4">
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Request deletion</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Tell us why this case should be removed. An admin will review requests before anything is deleted.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={4}
                      placeholder="Describe why this should be deleted..."
                      className="w-full border rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-600"
                    />
                  </div>
                  {error && <div className="text-sm text-red-600">{error}</div>}
                  {submitted && <div className="text-sm text-green-700">Thanks! Your request was submitted. This case is now hidden pending admin review.</div>}
                </div>
                <div className="mt-6 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 text-slate-700"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSubmit}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                    disabled={submitting || reason.trim().length === 0}
                  >
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}


type Verdict = {
  id: string;
  case_id: string;
  verdict: string;
  explanation: string | null;
  determined_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CaseVerdictProps = {
  verdict: Verdict;
};

export function CaseVerdict({ verdict }: CaseVerdictProps) {
  const getVerdictStyle = (verdictType: string) => {
    switch (verdictType) {
      case 'no_violation':
        return {
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-400',
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
          textColor: 'text-blue-900',
          icon: '✓',
          label: 'No Violation'
        };
      case 'violation_confirmed':
        return {
          bgColor: 'bg-red-50',
          borderColor: 'border-red-500',
          badgeColor: 'bg-red-100 text-red-800 border-red-200',
          textColor: 'text-red-900',
          icon: '⚠',
          label: 'Violation Confirmed'
        };
      case 'resolved':
        return {
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-400',
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
          textColor: 'text-blue-900',
          icon: '✓',
          label: 'Resolved'
        };
      case 'under_review':
        return {
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-500',
          badgeColor: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          textColor: 'text-yellow-900',
          icon: '👁',
          label: 'Under Review'
        };
      default:
        return {
          bgColor: 'bg-slate-50',
          borderColor: 'border-slate-500',
          badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
          textColor: 'text-slate-900',
          icon: '•',
          label: 'Pending'
        };
    }
  };

  const style = getVerdictStyle(verdict.verdict);

  return (
    <div className={`${style.bgColor} border-l-4 ${style.borderColor} rounded-xl p-6 shadow-sm`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{style.icon}</span>
          <div>
            <h3 className={`text-lg font-semibold ${style.textColor}`}>ActBlue Decision</h3>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border ${style.badgeColor} mt-1`}>
              {style.label}
            </span>
          </div>
        </div>
        {verdict.created_at && (
          <div className="text-xs text-slate-600">
            <LocalTime iso={verdict.created_at} options={{ year: "numeric", month: "short", day: "numeric" }} />
          </div>
        )}
      </div>

      {verdict.explanation && (
        <div className={`${style.textColor} text-sm leading-relaxed mb-3`}>
          {verdict.explanation}
        </div>
      )}

      {verdict.determined_by && (
        <div className="text-xs text-slate-600 mt-2">
          <span className="font-medium">Determined by:</span> {verdict.determined_by}
        </div>
      )}
    </div>
  );
}

type Comment = {
  id: string;
  content: string;
  created_at?: string | null;
  kind?: string | null;
};

type CommentsSectionProps = {
  id: string;
  initialComments: Array<Comment>;
};

export function CommentsSection({ id, initialComments }: CommentsSectionProps) {
  const [comments, setComments] = useState<Array<Comment>>(initialComments.filter((c) => (c.kind || "user") === "user"));
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const remaining = 240 - content.length;
  const atLimit = comments.length >= 10;

  const refreshComments = async () => {
    try {
      const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const rows = (data?.comments ?? []) as Array<Comment>;
      setComments(rows.filter((c) => (c.kind || "user") === "user"));
    } catch {}
  };

  const onSubmit = async () => {
    const submittedContent = content.trim();
    if (submittedContent.length === 0) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);

    // Optimistically add the comment so the user sees it immediately
    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = { id: tempId, content: submittedContent, kind: "user", created_at: new Date().toISOString() };
    setComments((prev) => [...prev, optimistic]);
    setContent("");

    // Immediate user feedback and start reclassification visuals without waiting on network
    setInfo("Comment added. Re-running AI with comments considered…");
    setToast("AI is re-running with your comment");
    setTimeout(() => setToast(null), 4000);
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("reclassify-started", { detail: { id } }));
      } catch {}
    }

    // Do not keep the UI in a submitting state while the network call is in-flight
    setSubmitting(false);

    try {
      const res = await fetch(`/api/cases/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: submittedContent }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to add comment");
      }
      // Replace optimistic state with server truth after a short delay (handles DB replication lag)
      setTimeout(() => { void refreshComments(); }, 1500);
    } catch (e: unknown) {
      // Roll back optimistic update on error
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setContent(submittedContent);
      const msg = e instanceof Error ? e.message : "Failed to add comment";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-black/5 p-6 md:p-8">
      {toast && typeof window !== "undefined" && createPortal(
        <div className="fixed top-4 right-4 z-[200]">
          <div className="px-4 py-3 rounded-xl shadow-lg bg-slate-900 text-white text-sm">
            {toast}
          </div>
        </div>,
        document.body
      )}
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Comments</h2>
      <p className="text-sm text-slate-600 mb-4">Adding a comment will immediately re-run the AI policy analysis with all comments considered.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Add a comment</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 240))}
            rows={3}
            placeholder="e.g., I think this may violate the fake match policy…"
            className="w-full border rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-600"
            maxLength={240}
            disabled={submitting || atLimit}
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-slate-500">{remaining} characters left</span>
            {atLimit && <span className="text-slate-600">Comment limit reached for this case (10)</span>}
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {info && <div className="text-sm text-slate-700">{info}</div>}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onSubmit}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={submitting || content.trim().length === 0 || atLimit}
          >
            {submitting ? "Submitting…" : "Submit Comment"}
          </button>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Existing comments</h3>
        {comments.length === 0 ? (
          <div className="text-sm text-slate-600">No comments yet.</div>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-800 whitespace-pre-wrap">{c.content}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type ReportCardProps = { id: string; existingLandingUrl?: string | null; processingStatus?: string | null };
export function ReportingCard({ id, existingLandingUrl = null, processingStatus = null }: ReportCardProps) {
  const [landingUrl, setLandingUrl] = useState(existingLandingUrl || "");
  const [ccEmail, setCcEmail] = useState("");
  const [note, setNote] = useState("");
  const [violationsOverride, setViolationsOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [previewSent, setPreviewSent] = useState(false);
  const [status, setStatus] = useState<string | null | undefined>(processingStatus);
  const policyHref = `https://help.actblue.com/hc/en-us/articles/16870069234839-ActBlue-Account-Use-Policy@${id}/`;
  const hasLanding = Boolean((landingUrl || existingLandingUrl || "").trim());
  const isProcessing = status !== "done";

  // Poll for processing status updates and landing URL
  useEffect(() => {
    if (status === "done") return; // Already done, no need to poll
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const item = data.item as { processing_status?: string | null; landing_url?: string | null } | null;
        if (!cancelled && item?.processing_status) {
          setStatus(item.processing_status);
          // Update landing URL if we got one and our field is empty
          if (item.landing_url) {
            setLandingUrl((prev) => {
              if (prev && prev.trim().length > 0) return prev;
              return item.landing_url ?? prev;
            });
          }
          if (item.processing_status === "done") {
            clearInterval(interval);
          }
        }
      } catch {}
    }, 2000);
    const timeout = setTimeout(() => {
      cancelled = true;
      clearInterval(interval);
    }, 120000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [id, status]);

  // Listen for reclassify events (from comments or landing page scans)
  useEffect(() => {
    const onReclassify = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (!detail || detail.id !== id) return;
      setStatus("classified"); // Reset to non-done status to trigger polling
      // Also fetch fresh landing URL when reclassified
      fetch(`/api/cases/${id}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          const item = data.item as { landing_url?: string | null } | null;
          if (item?.landing_url && !landingUrl) {
            setLandingUrl(item.landing_url);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("reclassify-started", onReclassify as EventListener);
    return () => window.removeEventListener("reclassify-started", onReclassify as EventListener);
  }, [id, landingUrl]);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/report-violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: id, landingUrl: landingUrl || undefined, ccEmail: ccEmail || undefined, note: note || undefined, violationsOverride: violationsOverride || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to send report");
      }
      setInfo("Report sent to ActBlue.");
      setCcEmail("");
      setNote("");
      setViolationsOverride("");
      // Notify report history to refresh
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new CustomEvent("report-sent", { detail: { id } }));
        } catch {}
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send report";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Visibility is fully controlled by the server (SSR) using hasReport; no client checks here

  const normalizeUrl = (u: string | null | undefined) => {
    if (!u) return null;
    try {
      const obj = new URL(u);
      return `${obj.origin}${obj.pathname}`;
    } catch {
      return u;
    }
  };

  const buildPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load case");
      const data = await res.json();
      const item = data.item as { sender_name?: string | null; sender_id?: string | null; created_at?: string | null } | null;
      const campaign = (item?.sender_name || item?.sender_id || "(unknown sender)") as string;
      const submissionDate = item?.created_at 
        ? new Date(item.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          })
        : null;
      // summary intentionally omitted from preview
      const vios = ((data.violations || []) as Array<{ code: string; title: string; description?: string | null; actblue_verified?: boolean | null }>).filter(
        (v) => !(v.code === "AB008" && v.actblue_verified === true)
      );
      const landing = normalizeUrl(landingUrl || existingLandingUrl);
      // Prefer primary submission screenshot via the image-url endpoint
      let shot: string | null = null;
      try {
        const r = await fetch(`/api/cases/${id}/image-url`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          shot = (j?.url as string) || null;
        }
      } catch {}

      // Build HTML matching the outbound email style
      const esc = (s: string) => String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
      const vioHtml = (() => {
        if (violationsOverride.trim().length > 0) {
          const ovLines = violationsOverride
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .map((l) => l.replace(/^[-\u2022]\s*/, ""));
          return ovLines.length > 1
            ? `<ul>${ovLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
            : `<p>${esc(ovLines[0] || "")}</p>`;
        }
        return vios.length > 0
          ? `<ul>${vios.map((v) => `<li><strong>${esc(v.code)}</strong> ${esc(v.title)}${v.description ? `: ${esc(v.description)}` : ""}</li>`).join("")}</ul>`
          : `<p>(none detected)</p>`;
      })();
      const shortId = id.split("-")[0];
      const html = `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.4;color:#0f172a">
  <div>
    <p style=\"margin:0 0 8px 0\"><strong>Campaign/Org</strong></p>
    <p style=\"margin:0 0 16px 0\">${esc(campaign)}</p>

    ${submissionDate ? `<p style=\"margin:0 0 8px 0\"><strong>Original message received on</strong></p><p style=\"margin:0 0 16px 0\">${esc(submissionDate)}</p>` : ""}

    <p style=\"margin:0 0 8px 0\"><strong>Violations</strong></p>
    <div style=\"margin:0 0 16px 0\">${vioHtml}</div>

    <p style=\"margin:0 0 8px 0\"><strong>Landing page</strong></p>
    <p style=\"margin:0 0 16px 0\">${landing ? `<a href=\"${esc(landing)}\" target=\"_blank\" rel=\"noopener noreferrer\">${esc(landing)}</a>` : "(none)"}</p>

    ${note.trim() ? `<p style=\"margin:0 0 8px 0\"><strong>Reporter note</strong></p><p style=\"margin:0 0 16px 0\">${esc(note.trim())}</p>` : ""}
    ${shot ? `<p style=\"margin:0 0 8px 0\"><strong>Screenshot</strong></p><p style=\"margin:0 0 16px 0\"><a href=\"${esc(shot)}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"display:inline-flex;align-items:center;gap:6px;text-decoration:underline\"><svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\" ry=\"2\" stroke=\"#334155\" stroke-width=\"2\"/><path d=\"M8 7l2-3h4l2 3\" stroke=\"#334155\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"12\" cy=\"14\" r=\"3\" stroke=\"#334155\" stroke-width=\"2\"/></svg><span>Screenshot</span></a></p>` : ""}

    <p style=\"margin:16px 0 4px 0\"><strong>Meta</strong></p>
    <p style=\"margin:0\">This report was submitted using AB Jail.</p>
    <p style=\"margin:0\">Case UUID: <code>${esc(id)}</code></p>
    <p style=\"margin:0\">Case short_id: <code>${esc(shortId)}</code></p>
  </div>
  </body></html>`;
      setPreviewHtml(html);
      setPreviewOpen(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to build preview";
      setPreviewError(msg);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Prefill violations editor with the current AI violations (truncated to 500)
  // Runs when advanced section is expanded
  useEffect(() => {
    if (!advancedOpen) return; // Only load when advanced is opened
    if (violationsOverride.trim().length > 0) return; // Already populated
    
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const vios = ((data.violations || []) as Array<{ code: string; title: string; description?: string | null; actblue_verified?: boolean | null }>).filter(
          (v) => !(v.code === "AB008" && v.actblue_verified === true)
        );
        if (!cancelled && Array.isArray(vios)) {
          const text = vios.length > 0
            ? vios.map((v) => `- ${v.code} ${v.title}${v.description ? `: ${v.description}` : ""}`).join("\n")
            : "";
          if (text) setViolationsOverride(text.slice(0, 2000));
        }
      } catch {}
    };
    void load();
    return () => { cancelled = true; };
  }, [id, advancedOpen, violationsOverride]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-black/5 p-6 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-1">Submit report</h2>
          <p className="text-sm text-slate-600">Destination: ActBlue</p>
        </div>
        <a
          href={policyHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 bg-white/70 text-slate-700 hover:bg-white hover:text-slate-900 hover:border-slate-300 shadow-sm transition-colors"
          title="Open ActBlue Account Use Policy"
        >
          <span>ActBlue Account Use Policy</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </a>
      </div>
      {reportSent && (
        <div className="py-6 flex items-center justify-center">
          <EmailSuccessAnimation message="Report sent to ActBlue!" />
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4" hidden={reportSent}>
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">Landing Page URL</label>
          <input
            type="url"
            value={landingUrl}
            onChange={(e) => setLandingUrl(e.target.value)}
            placeholder="https://secure.actblue.com/donate/..."
            className="w-full border rounded-xl p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-600 shadow-sm"
          />
          <div className="mt-1 text-xs text-slate-600">Required to send a report. Enter the ActBlue landing page URL.</div>
        </div>

        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">Optional CC Email</label>
          <input
            type="email"
            value={ccEmail}
            onChange={(e) => setCcEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full border rounded-xl p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-600 shadow-sm"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-sm text-slate-700 underline hover:text-slate-900"
          >
            {advancedOpen ? "Hide advanced" : "Expand for Advanced"}
          </button>
        </div>

        {advancedOpen && (
          <>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Edit violations for report (max 2000)</label>
              <textarea
                value={violationsOverride}
                onChange={(e) => setViolationsOverride(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="Optionally summarize or edit violations in your own words…"
                className="w-full border rounded-xl p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-600 shadow-sm"
                maxLength={2000}
              />
              <div className="mt-1 text-xs text-slate-600">{2000 - violationsOverride.length} characters left</div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Optional note (240 characters)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 240))}
                rows={3}
                placeholder="Add brief context for the reviewer…"
                className="w-full border rounded-xl p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-600 shadow-sm"
                maxLength={240}
              />
              <div className="mt-1 text-xs text-slate-600">{240 - note.length} characters left</div>
            </div>
          </>
        )}

        

        {error && <div className="text-sm text-red-600 md:col-span-2">{error}</div>}
        {info && <div className="text-sm text-green-700 md:col-span-2">{info}</div>}

        <div className="flex items-center justify-end gap-2 md:col-span-2">
          <Tooltip label={isProcessing ? "AI is still analyzing violations" : (!hasLanding ? "Landing page is required" : "")}>
            <button
              type="button"
              onClick={buildPreview}
              className={`px-4 py-2 rounded-xl border ${hasLanding && !isProcessing ? "bg-white hover:bg-slate-50 text-slate-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
              disabled={submitting || previewLoading || !hasLanding || isProcessing}
            >
              {previewLoading ? "Preparing…" : "Preview Report"}
            </button>
          </Tooltip>
          <Tooltip label={isProcessing ? "AI is still analyzing violations" : (!hasLanding ? "Landing page is required" : undefined)}>
            <button
              type="button"
            onClick={async () => { await onSubmit(); if (!error) setReportSent(true); }}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow"
              disabled={submitting || !hasLanding || isProcessing}
            >
              {submitting ? "Sending…" : "Submit Report"}
            </button>
          </Tooltip>
        </div>
      </div>

      {previewOpen && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewOpen(false)} />
          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex items-start sm:items-center justify-center p-4">
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Preview report</h3>
                {previewError && <div className="text-sm text-red-600 mb-2">{previewError}</div>}
                {previewSent ? (
                  <div className="py-6 flex items-center justify-center">
                    <EmailSuccessAnimation message="Report sent to ActBlue!" />
                  </div>
                ) : (
                  <div className="border rounded-xl bg-white max-h-[60vh] overflow-auto">
                    <div className="p-4 text-sm text-slate-900" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                )}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button type="button" onClick={() => { setPreviewOpen(false); setPreviewSent(false); }} className="px-4 py-2 rounded-xl border bg-white hover:bg-slate-50 text-slate-700">Close</button>
                  {!previewSent && (
                    <Tooltip label={isProcessing ? "AI is still analyzing violations" : (!hasLanding ? "Landing page is required" : "")}>
                      <button type="button" onClick={async () => { if (!hasLanding || isProcessing) return; await onSubmit(); setPreviewSent(true); }} className={`px-4 py-2 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed ${hasLanding && !isProcessing ? "bg-slate-900 hover:bg-slate-800" : "bg-slate-400 cursor-not-allowed"}`} disabled={submitting || !hasLanding || isProcessing}>
                        {submitting ? "Sending…" : "Send Report"}
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

type EvidenceViewerProps = {
  src: string;
  alt?: string;
  mime?: string | null;
};

export function EvidenceViewer({ src, alt = "Evidence screenshot", mime = null }: EvidenceViewerProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!mime || mime.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = src;
    }
    return () => {
      cancelled = true;
    };
  }, [src, mime]);

  return (
    <>
      {mime === "application/pdf" ? (
        <div className="w-full h-[360px] md:h-[400px] bg-white">
          <iframe src={src} title={alt} className="w-full h-full" />
        </div>
      ) : (
        <Gallery withCaption options={{ initialZoomLevel: 0.5 }}>
          <Item
            original={src}
            thumbnail={src}
            caption={alt}
            width={dimensions?.width}
            height={dimensions?.height}
          >
            {({ ref, open }) => (
              <button type="button" onClick={open} className="block w-full relative hover:opacity-90 hover:scale-[1.02] transition-all duration-200 cursor-pointer group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={ref as unknown as React.MutableRefObject<HTMLImageElement | null>} src={src} alt={alt} className="w-full h-auto object-contain group-hover:shadow-lg transition-shadow duration-200" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-200 rounded-lg pointer-events-none" />
              </button>
            )}
          </Item>
        </Gallery>
      )}
    </>
  );
}

type EvidenceTabsProps = {
  caseId: string;
  messageType: string | null | undefined;
  rawText: string | null | undefined;
  emailBody?: string | null | undefined;
  screenshotUrl: string | null | undefined;
  screenshotMime?: string | null | undefined;
  landingImageUrl: string | null | undefined;
  landingLink?: string | null | undefined;
  landingStatus?: string | null | undefined;
};

export function EvidenceTabs({ caseId, messageType, rawText, emailBody, screenshotUrl, screenshotMime = null, landingImageUrl, landingLink, landingStatus }: EvidenceTabsProps) {
  // Note: Email redaction is now handled server-side during ingestion.
  // The data we receive here is already redacted, so no client-side redaction is needed.

  const [tab, setTab] = useState<"primary" | "plaintext" | "landing">("primary");
  const [scanUrl, setScanUrl] = useState("");
  const [scanStatus, setScanStatus] = useState<null | "idle" | "pending" | "success" | "failed">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lpUrl, setLpUrl] = useState<string | null>(landingImageUrl || null);
  const [lpLink, setLpLink] = useState<string | null>(landingLink || null);
  const [lpLoading, setLpLoading] = useState<boolean>(!landingImageUrl && (landingStatus === "pending" || landingStatus === "success"));
  const router = useRouter();
  useEffect(() => {
    if (!landingImageUrl) {
      setLpLoading(true);
      void fetch(`/api/cases/${caseId}/landing-url?ts=${Date.now()}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          if (data?.url) {
            setLpUrl(data.url as string);
            setLpLink((data.landingUrl as string) || null);
          }
        })
        .catch(() => undefined)
        .finally(() => setLpLoading(false));
    } else {
      setLpLoading(false);
    }
  }, [caseId, landingImageUrl, landingLink, landingStatus]);
  const primaryLabel = messageType === "sms" ? "SMS" : "Submission";
  const isScanning = scanStatus === "pending";
  const hasLanding = true;

  const onScanSubmit = async (caseId: string) => {
    const u = scanUrl.trim();
    if (!u) return;
    setScanStatus("pending");
    setError(null);
    setInfo("Generating screenshot… This can take up to 15 seconds.");
    setLpLoading(true);
    try {
      const res = await fetch(`/api/screenshot-actblue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, url: u }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Screenshot failed");
      }
      setScanStatus("success");
      setInfo("Screenshot saved. Re-running analysis with landing page context…");
      setScanUrl("");
      router.refresh();
      // try to refresh landing preview shortly after
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/cases/${caseId}/landing-url?ts=${Date.now()}`, { cache: "no-store" });
          if (res.ok) {
            const d = await res.json();
            if (d?.url) {
              setLpUrl(d.url);
              setLpLink(d.landingUrl || null);
            }
          }
        } catch {}
        setLpLoading(false);
      }, 1000);
      if (typeof window !== "undefined") {
        try { window.dispatchEvent(new CustomEvent("reclassify-started", { detail: { id: caseId } })); } catch {}
      }
    } catch (e: unknown) {
      setScanStatus("failed");
      const msg = e instanceof Error ? e.message : "Failed to capture";
      setError(msg);
      setLpLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 inline-flex items-center gap-2 rounded-lg p-1 bg-slate-100">
        <button
          type="button"
          onClick={() => setTab("primary")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "primary" ? "bg-white text-slate-900 shadow" : "text-slate-700 hover:text-slate-900"}`}
        >
          {primaryLabel}
        </button>
        {(emailBody || rawText) && (
          <button
            type="button"
            onClick={() => setTab("plaintext")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "plaintext" ? "bg-white text-slate-900 shadow" : "text-slate-700 hover:text-slate-900"}`}
          >
            Plain Text
          </button>
        )}
        {hasLanding && (
          <button
            type="button"
            onClick={() => setTab("landing")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "landing" ? "bg-white text-slate-900 shadow" : "text-slate-700 hover:text-slate-900"}`}
          >
            Landing Page
          </button>
        )}
      </div>

      {tab === "primary" ? (
        <div key="primary-tab">
          {screenshotUrl ? (
            <div className="rounded-2xl overflow-hidden bg-slate-50 mx-auto w-full max-w-[520px] border border-slate-100">
              <div className="max-h-[520px] overflow-auto">
                <EvidenceViewer src={screenshotUrl} alt="Message screenshot" mime={screenshotMime || null} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden bg-white border border-slate-200">
              {emailBody ? (
                <div className="w-full h-[500px] overflow-auto bg-slate-50">
                  <iframe
                    srcDoc={`<style>body { margin: 20px !important; padding: 20px !important; box-sizing: border-box !important; }</style>${emailBody}`}
                    title="Email preview"
                    className="w-full border-0"
                    style={{ height: '125%', zoom: 0.8 }}
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : rawText ? (
                <div className="p-4">
                  <pre className="whitespace-pre-wrap break-words text-sm text-slate-900 max-h-96 overflow-auto">{normalizePunctuation(repairMojibake(rawText))}</pre>
                </div>
              ) : (
                <div className="p-4 text-slate-600 text-sm">No primary evidence available.</div>
              )}
            </div>
          )}
        </div>
      ) : tab === "plaintext" ? (
        <div key="plaintext-tab">
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            {rawText ? (
              <pre className="whitespace-pre-wrap break-words text-sm text-slate-900 max-h-96 overflow-auto font-mono">{normalizePunctuation(repairMojibake(rawText))}</pre>
            ) : (
              <div className="text-slate-600 text-sm">No plain text available.</div>
            )}
          </div>
        </div>
      ) : (
        <div key="landing-tab">
          {/* client-side poll when opening Landing tab and we don't yet have a URL */}
          {!lpUrl && (landingStatus === "pending" || landingStatus === "success") && (
            <LandingPoll
              caseId={caseId}
              onReady={(u, l) => {
                setLpUrl(u);
                setLpLink(l);
              }}
              onFinish={() => setLpLoading(false)}
            />
          )}
          {lpLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <LandingPageScanner />
              <div className="text-sm text-slate-600" aria-live="polite">{isScanning ? "Scanning landing page…" : "Loading landing page…"}</div>
            </div>
          )}
          {lpUrl && !lpLoading ? (
            <>
              <div className="rounded-2xl overflow-hidden bg-slate-50 mx-auto w-full max-w-[520px] border border-slate-100">
                <div className="max-h-[520px] overflow-auto">
                  <EvidenceViewer src={lpUrl} alt="Landing page screenshot" mime={"image/png"} />
                </div>
              </div>
              {lpLink && (
                <div className="mt-2 text-xs">
                  <a href={lpLink} target="_blank" className="text-slate-700 underline truncate inline-block max-w-full" title={lpLink}>{lpLink.split("?")[0]}</a>
                </div>
              )}
            </>
          ) : (!lpLoading && (
            <div className="text-slate-600 text-sm">
              <div className="mb-2">No landing page captured yet.</div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ActBlue URL</label>
              <input
                type="url"
                value={scanUrl}
                onChange={(e) => setScanUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onScanSubmit(caseId); }}
                placeholder="https://secure.actblue.com/donate/..."
                className="w-full border rounded-xl p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder-slate-600"
              />
              <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-600">
                {isScanning && <span className="inline-flex items-center gap-1 text-slate-600"><span className="w-3 h-3 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />Scanning…</span>}
                <button
                  type="button"
                  onClick={() => onScanSubmit(caseId)}
                  disabled={isScanning || !scanUrl.trim()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 text-sm"
                >
                  {isScanning ? "Scanning…" : "Capture Screenshot"}
                </button>
              </div>
              {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
              {info && <div className="mt-1 text-xs text-slate-700">{info}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LandingPoll({ caseId, onReady, onFinish }: { caseId: string; onReady: (url: string, link: string | null) => void; onFinish: () => void }) {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        for (let i = 0; i < 8; i++) {
          const res = await fetch(`/api/cases/${caseId}/landing-url?ts=${Date.now()}`, { cache: "no-store" });
          if (!res.ok) break;
          const d = await res.json();
          if (d?.url) {
            if (!cancelled) onReady(d.url as string, (d.landingUrl as string) || null);
            if (!cancelled) onFinish();
            return;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (!cancelled) onFinish();
      } catch {}
    };
    run();
    return () => { cancelled = true; };
  }, [caseId, onFinish, onReady]);
  return null;
}

type InboundSMSViewerProps = {
  rawText: string | null;
  fromNumber: string | null;
  createdAt?: string | null;
  mediaUrls?: Array<{ url: string; contentType?: string }>;
};

export function InboundSMSViewer({ rawText, fromNumber, createdAt, mediaUrls }: InboundSMSViewerProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-black/5 p-6 md:p-8">
      <h2 className="text-xl font-semibold text-slate-900 mb-6">AB Jail Bot</h2>
      <div className="rounded-2xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">From:</span> {fromNumber || "(unknown)"}
            {createdAt && (
              <span className="ml-3 text-slate-500">Received <LocalTime iso={createdAt} /></span>
            )}
          </div>
        </div>
        <div className="p-4 space-y-3">
          {/* Media attachments */}
          {mediaUrls && mediaUrls.length > 0 && (
            <div className="space-y-2">
              {mediaUrls.map((media, idx) => (
                <div key={idx} className="rounded-2xl overflow-hidden bg-slate-50 border border-slate-100">
                  <Gallery>
                    <Item
                      original={media.url}
                      thumbnail={media.url}
                      width="1024"
                      height="768"
                    >
                      {({ ref, open }) => (
                        <div ref={ref as React.Ref<HTMLDivElement>} onClick={open} className="cursor-pointer hover:opacity-90 transition-opacity">
                          <NextImage
                            src={media.url}
                            alt={`Media attachment ${idx + 1}`}
                            width={1024}
                            height={768}
                            className="w-full"
                          />
                        </div>
                      )}
                    </Item>
                  </Gallery>
                </div>
              ))}
            </div>
          )}
          
          {/* Text message */}
          <div className="max-h-[400px] overflow-auto">
            <div className="bg-slate-100 text-slate-800 rounded-2xl p-4 inline-block shadow-inner">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {rawText ? normalizePunctuation(repairMojibake(rawText)) : "(no message body)"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Removed body background toggler to avoid FOUC on refresh
