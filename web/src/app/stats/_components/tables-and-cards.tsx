"use client";

import { FormEvent, memo, useState } from "react";
import { useRouter } from "next/navigation";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  type StatsData,
  type AdvancedStatsData,
  type DataRequestField,
  CHART_COLORS,
  DATA_REQUEST_FIELD_OPTIONS,
} from "../_lib/use-stats";

// ──────────────────────────── KPI Cards ────────────────────────────

function Sparkline({
  data,
  color,
}: {
  data: Array<{ bucket: string; count: number }> | null;
  color: string;
}) {
  if (!data || data.length < 2) return null;
  const chartData = data.map((d) => ({ v: d.count }));

  return (
    <div className="w-20 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, "")})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCards({
  data,
  showingPermittedOnly,
}: {
  data: StatsData;
  showingPermittedOnly: boolean;
}) {
  const { kpis, captures_by_bucket, violations_by_bucket, reports_by_bucket, top_senders } = data;

  const violationRate = kpis.total_captures > 0
    ? ((kpis.captures_with_violations / kpis.total_captures) * 100).toFixed(1)
    : "0";
  const reportRate = kpis.total_captures > 0
    ? ((kpis.total_reports / kpis.total_captures) * 100).toFixed(1)
    : "0";

  const cards = showingPermittedOnly
    ? [
        {
          label: "Captures Detected",
          value: kpis.total_captures.toLocaleString(),
          description: "Permitted matching program activity",
          sparkData: captures_by_bucket,
          sparkColor: CHART_COLORS.captures,
        },
        {
          label: "Reports Filed",
          value: kpis.total_reports.toLocaleString(),
          description: `${reportRate}% of captures reported`,
          sparkData: reports_by_bucket,
          sparkColor: CHART_COLORS.reports,
        },
        {
          label: "Senders Flagged",
          value: (top_senders?.length || 0).toLocaleString(),
          description: "Distinct sender accounts",
          sparkData: null,
          sparkColor: CHART_COLORS.violations,
        },
        {
          label: "Total Captures",
          value: kpis.total_captures.toLocaleString(),
          description: `${kpis.user_uploads.toLocaleString()} user / ${kpis.honeytraps.toLocaleString()} bot`,
          sparkData: captures_by_bucket,
          sparkColor: CHART_COLORS.captures,
        },
      ]
    : [
        {
          label: "Violation Rate",
          value: `${violationRate}%`,
          description: `${kpis.captures_with_violations.toLocaleString()} of ${kpis.total_captures.toLocaleString()} captures`,
          sparkData: violations_by_bucket,
          sparkColor: CHART_COLORS.violations,
        },
        {
          label: "Reports Filed",
          value: kpis.total_reports.toLocaleString(),
          description: `${reportRate}% of captures reported`,
          sparkData: reports_by_bucket,
          sparkColor: CHART_COLORS.reports,
        },
        {
          label: "Senders Flagged",
          value: (top_senders?.length || 0).toLocaleString(),
          description: "Distinct sender accounts",
          sparkData: null,
          sparkColor: CHART_COLORS.violations,
        },
        {
          label: "Total Captures",
          value: kpis.total_captures.toLocaleString(),
          description: `${kpis.user_uploads.toLocaleString()} user / ${kpis.honeytraps.toLocaleString()} bot`,
          sparkData: captures_by_bucket,
          sparkColor: CHART_COLORS.captures,
        },
      ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="text-xs md:text-sm text-muted-foreground mb-1">{card.label}</div>
            <Sparkline data={card.sparkData} color={card.sparkColor} />
          </div>
          <div className="text-2xl md:text-3xl font-semibold text-foreground mb-1 tabular-nums">
            {card.value}
          </div>
          <div className="text-xs text-muted-foreground">{card.description}</div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────── Enhanced Sender Table ────────────────────────────

type SortKey = "sender" | "total_captures" | "captures_with_violations" | "violation_rate" | "top_violation_code" | "first_seen" | "last_seen";
type SortDir = "asc" | "desc";

export const SenderTable = memo(function SenderTable({
  senders,
}: {
  senders: AdvancedStatsData["sender_stats"];
}) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("captures_with_violations");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const itemsPerPage = 10;

  if (!senders || senders.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
        <h3 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4"
          style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
          Sender Intelligence
        </h3>
        <div className="py-8 md:py-12 text-center text-xs md:text-sm text-muted-foreground">
          No senders yet
        </div>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setCurrentPage(1);
  };

  const sorted = [...senders].sort((a, b) => {
    let cmp = 0;
    const av = a[sortKey as keyof typeof a];
    const bv = b[sortKey as keyof typeof b];
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv);
    else if (av == null && bv != null) cmp = -1;
    else if (av != null && bv == null) cmp = 1;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayed = sorted.slice(startIndex, startIndex + itemsPerPage);

  const SortHeader = ({ k, label, align }: { k: SortKey; label: string; align?: string }) => (
    <th
      className={`py-2 pr-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${align || ""}`}
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (
          <span className="text-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
        Sender Intelligence
      </h3>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {displayed.map((s) => (
          <div
            key={s.sender}
            className="bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/cases?senders=${encodeURIComponent(s.sender)}`)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/cases?senders=${encodeURIComponent(s.sender)}`); } }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="font-semibold text-foreground text-sm leading-tight truncate">{s.sender}</div>
              {s.is_repeat_offender && (
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive shrink-0 mt-0.5" title="Repeat offender" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="text-muted-foreground">Messages: <span className="text-foreground font-medium">{s.total_captures}</span></div>
              <div className="text-muted-foreground">Violations: <span className="text-foreground font-medium">{s.captures_with_violations}</span></div>
              <div className="text-muted-foreground">Rate: <span className="text-foreground font-medium">{s.violation_rate}%</span></div>
              {s.top_violation_code && <div className="text-muted-foreground">Top: <span className="font-mono text-foreground">{s.top_violation_code}</span></div>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left border-b border-border">
            <tr>
              <SortHeader k="sender" label="Sender" />
              <SortHeader k="total_captures" label="Messages" align="text-right" />
              <SortHeader k="captures_with_violations" label="Violations" align="text-right" />
              <SortHeader k="violation_rate" label="Rate" align="text-right" />
              <SortHeader k="top_violation_code" label="Top Code" align="text-center" />
              <SortHeader k="first_seen" label="First Seen" align="text-right" />
              <SortHeader k="last_seen" label="Last Seen" align="text-right" />
              <th className="py-2 font-medium text-muted-foreground text-center">Repeat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayed.map((s) => (
              <tr
                key={s.sender}
                className="hover:bg-accent cursor-pointer transition-colors"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/cases?senders=${encodeURIComponent(s.sender)}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/cases?senders=${encodeURIComponent(s.sender)}`); } }}
              >
                <td className="py-2 pr-4 text-foreground truncate max-w-[200px]">{s.sender}</td>
                <td className="py-2 pr-4 text-foreground tabular-nums text-right">{s.total_captures}</td>
                <td className="py-2 pr-4 text-foreground tabular-nums text-right">{s.captures_with_violations}</td>
                <td className="py-2 pr-4 text-foreground tabular-nums text-right">{s.violation_rate}%</td>
                <td className="py-2 pr-4 text-center font-mono text-xs">{s.top_violation_code || "—"}</td>
                <td className="py-2 pr-4 text-muted-foreground text-right text-xs">{s.first_seen}</td>
                <td className="py-2 pr-4 text-muted-foreground text-right text-xs">{s.last_seen}</td>
                <td className="py-2 text-center">
                  {s.is_repeat_offender && (
                    <span className="inline-block w-2 h-2 rounded-full bg-destructive" title="Repeat offender (≥3 violations)" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 md:mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs md:text-sm text-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sorted.length)} of {sorted.length} senders
          </p>
          <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      )}
    </div>
  );
});

// ──────────────────────────── Data Request Section ────────────────────────────

export function DataRequestSection() {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<DataRequestField[]>([]);

  const toggleField = (f: DataRequestField) => {
    setFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const reset = () => {
    setName(""); setEmail(""); setDescription(""); setFields([]); setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = name.trim(), em = email.trim(), d = description.trim();
    if (!n || !em || !d || fields.length === 0) {
      setError("Please complete all fields and choose at least one dataset.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/data-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, email: em, description: d, dateRange: "All available data", fields }),
      });
      if (!res.ok) {
        const details = await res.json().catch(() => null);
        setError(details?.error === "validation_failed" ? "Please double-check the form fields." : (typeof details?.error === "string" ? details.error.replace(/_/g, " ") : "Something went wrong."));
        return;
      }
      setBanner({ type: "success", message: "Request received. We'll review and follow up via email." });
      reset();
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card rounded-2xl border border-border shadow-sm max-w-3xl mx-auto">
      <button
        type="button"
        onClick={() => { setExpanded(!expanded); setError(null); if (banner) setBanner(null); }}
        className="w-full p-4 md:p-6 text-left hover:bg-accent transition-colors rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base md:text-lg font-semibold text-foreground">Request Data Export</h3>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Researchers can request an export of AB Jail data for analysis.
            </p>
          </div>
          <svg className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ml-4 ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {banner && (
        <div className="px-6 pb-4">
          <div className={`rounded-md border px-4 py-3 text-sm ${banner.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-destructive bg-destructive/10 text-destructive"}`}>
            {banner.message}
          </div>
        </div>
      )}

      {expanded && (
        <form onSubmit={handleSubmit} className="px-4 md:px-6 pb-4 md:pb-6 space-y-4 border-t border-border pt-4 md:pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="dr-name">Name</label>
              <input id="dr-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Your full name" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="dr-email">Email</label>
              <input id="dr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="you@example.com" required />
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Include:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DATA_REQUEST_FIELD_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-accent cursor-pointer transition-colors">
                  <input type="checkbox" checked={fields.includes(opt.value)} onChange={() => toggleField(opt.value)} className="h-4 w-4 rounded border-border text-primary focus:ring-ring" />
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="dr-desc">How will you use this data?</label>
            <textarea id="dr-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[100px] w-full rounded-md border border-border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Brief description of your research or intended use" required />
          </div>

          {error && <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setExpanded(false); reset(); }} disabled={submitting} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent disabled:opacity-50 transition-colors">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {submitting ? "Sending..." : "Submit Request"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ──────────────────────────── Shared Pagination ────────────────────────────

function TablePagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const getPages = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [1];
    if (currentPage <= 3) pages.push(2, 3, 4, "ellipsis", totalPages);
    else if (currentPage >= totalPages - 2) pages.push("ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    else pages.push("ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages);
    return pages;
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            size="default"
            onClick={(e) => { e.preventDefault(); if (currentPage > 1) onPageChange(currentPage - 1); }}
            className={`cursor-pointer text-foreground hover:text-foreground ${currentPage === 1 ? "pointer-events-none opacity-50" : ""}`}
          />
        </PaginationItem>
        {getPages().map((p, idx) => (
          <PaginationItem key={idx}>
            {p === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href="#"
                size="icon"
                onClick={(e) => { e.preventDefault(); onPageChange(p); }}
                isActive={currentPage === p}
                className={`cursor-pointer ${currentPage === p ? "" : "text-foreground hover:bg-accent"}`}
              >
                {p}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            size="default"
            onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) onPageChange(currentPage + 1); }}
            className={`cursor-pointer text-foreground hover:text-foreground ${currentPage === totalPages ? "pointer-events-none opacity-50" : ""}`}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
