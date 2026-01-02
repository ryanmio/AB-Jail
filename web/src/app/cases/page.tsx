import Link from "next/link";
import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";
import { VIOLATION_POLICIES, AUP_HELP_URL } from "@/lib/violation-policies";
import { isBotSubmitted } from "@/lib/badge-helpers";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { SenderSearchCombobox } from "@/components/sender-search-combobox";
import { CasesFilterForm } from "@/components/cases-filter-form";

type SubmissionRow = {
  id: string;
  createdAt: string;
  senderId: string | null;
  senderName: string | null;
  rawText: string | null;
  issues: Array<{ code: string; title: string; actblue_verified?: boolean | null }>;
  messageType?: string | null;
  forwarderEmail?: string | null;
  imageUrl?: string | null;
  hasReport?: boolean;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

// Derive a clean one-line preview that skips email metadata headers and PII redaction noise,
// and prefers the first legitimate sentence of content.
function derivePreview(text?: string | null): string {
  if (!text) return "";

  const lines = text.split(/\r?\n/);
  const headerRegex = /^(From|Date|Subject|To|Cc|Bcc|Reply-To):/i;
  const forwardedDividerRegex = /^-+\s*(Forwarded message|Original Message)\s*-+$/i;

  const contentLines: string[] = [];

  for (const raw of lines) {
    // normalize: drop quote markers and leading whitespace
    const line = raw.replace(/^[>\s]+/, "").trim();
    if (!line) continue;

    // Skip metadata headers
    if (headerRegex.test(line)) continue;

    // Skip common forward dividers
    if (forwardedDividerRegex.test(line)) continue;

    const lower = line.toLowerCase();

    // Skip common unsubscribe / footer boilerplate that sometimes appears at the top
    if (
      lower.startsWith("click here to unsubscribe") ||
      lower.startsWith("to unsubscribe") ||
      lower.includes("unsubscribe from this email") ||
      lower.includes("unsubscribe from these emails") ||
      lower.includes("unsubscribe or update your preferences") ||
      (lower.includes("unsubscribe") && lower.length <= 80)
    ) {
      continue;
    }

    // Skip bare bracketed markers like "[LINK]" or "[IMAGE]"
    if (/^\[[A-Z0-9 _-]+\]$/i.test(line)) continue;

    // Skip lines that are mostly asterisks (PII redaction) or punctuation
    const withoutStars = line.replace(/\*/g, "");
    const nonPunct = withoutStars.replace(/[.,;:!?'"`~\-–—\s]/g, "");
    const starRatio = 1 - withoutStars.length / Math.max(line.length, 1);
    if (!nonPunct && starRatio > 0.3) continue;

    contentLines.push(line);
  }

  if (contentLines.length === 0) {
    return text.slice(0, 160);
  }

  // Join a few leading lines to reconstruct a natural sentence flow.
  const joined = contentLines.slice(0, 5).join(" ").replace(/\s+/g, " ").trim();

  // Remove long runs of asterisks from redaction so we don't lead with "*******".
  const cleaned = joined.replace(/\*{3,}/g, "").replace(/\s{2,}/g, " ").trim();
  if (!cleaned) {
    return text.slice(0, 160);
  }

  // Extract the first sentence-ish chunk.
  const sentenceMatch = cleaned.match(/^(.+?[.!?])(?:\s+|$)/);
  const firstSentence = (sentenceMatch ? sentenceMatch[1] : cleaned).trim();

  // Truncate to a reasonable preview length.
  const MAX_LEN = 200;
  if (firstSentence.length <= MAX_LEN) {
    return firstSentence;
  }
  return `${firstSentence.slice(0, MAX_LEN - 1)}…`;
}

async function loadCases(page = 1, limit = 20, q = "", codes: string[] = [], senders: string[] = [], sources: string[] = [], types: string[] = [], base = ""): Promise<{ items: SubmissionRow[]; page: number; limit: number; total: number; hasMore: boolean; offset: number; }>
{
  try {
    const usp = new URLSearchParams();
    usp.set("page", String(page));
    usp.set("limit", String(limit));
    if (q) usp.set("q", q);
    usp.set("include", "top_violations");
    if (codes && codes.length > 0) {
      // Send as comma-separated list for brevity
      usp.set("codes", codes.join(","));
    }
    if (senders && senders.length > 0) {
      // Send as comma-separated list for brevity
      usp.set("senders", senders.join(","));
    }
    if (sources && sources.length > 0) {
      // Send as comma-separated list for brevity
      usp.set("sources", sources.join(","));
    }
    if (types && types.length > 0) {
      // Send as comma-separated list for brevity
      usp.set("types", types.join(","));
    }
    const res = await fetch(`${base}/api/cases?${usp.toString()}`, { cache: "no-store" });
    if (!res.ok) return { items: [], page, limit, total: 0, hasMore: false, offset: 0 };
    const data = await res.json();
    const rows = (data.items || []) as Array<{
      id: string;
      created_at?: string;
      createdAt?: string;
      sender_id?: string | null;
      senderId?: string | null;
      sender_name?: string | null;
      senderName?: string | null;
      raw_text?: string | null;
      rawText?: string | null;
      issues?: Array<{ code: string; title: string }>;
      message_type?: string | null;
      messageType?: string | null;
      forwarder_email?: string | null;
      forwarderEmail?: string | null;
      image_url?: string | null;
      imageUrl?: string | null;
      hasReport?: boolean;
    }>;
    const withIssues = rows.map((r) => ({
      id: r.id,
      createdAt: (r.created_at || r.createdAt || new Date(0).toISOString()) as string,
      senderId: r.sender_id || r.senderId || null,
      senderName: r.sender_name || r.senderName || null,
      rawText: r.raw_text || r.rawText || null,
      issues: Array.isArray(r.issues)
        ? r.issues.filter((v) => typeof v.code === "string" && v.code.trim()).slice(0, 3)
        : [],
      messageType: r.message_type || r.messageType || null,
      forwarderEmail: r.forwarder_email || r.forwarderEmail || null,
      imageUrl: r.image_url || r.imageUrl || null,
      hasReport: r.hasReport || false,
    }));
    return {
      items: withIssues,
      page: Number(data.page) || page,
      limit: Number(data.limit) || limit,
      total: Number(data.total) || withIssues.length,
      hasMore: Boolean(data.hasMore),
      offset: Number(data.offset) || (page - 1) * limit,
    };
  } catch {
    return { items: [], page, limit, total: 0, hasMore: false, offset: 0 };
  }
}

export default async function CasesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const hdrs = await import("next/headers").then(m => m.headers());
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const sp: Record<string, string | string[] | undefined> = searchParams ? await searchParams : {};
  const pageParam = Array.isArray(sp["page"]) ? sp["page"][0] : sp["page"];
  const limitParam = Array.isArray(sp["limit"]) ? sp["limit"][0] : sp["limit"];
  const qParam = Array.isArray(sp["q"]) ? sp["q"][0] : sp["q"];
  // Parse codes from query (supports both repeated and comma-separated)
  const codesParam = sp["codes"];
  const selectedCodes: string[] = Array.isArray(codesParam)
    ? codesParam.flatMap((v) => String(v).split(","))
    : typeof codesParam === "string" && codesParam.length > 0
      ? String(codesParam).split(",")
      : [];
  // Parse senders from query (supports both repeated and comma-separated)
  const sendersParam = sp["senders"];
  const selectedSenders: string[] = Array.isArray(sendersParam)
    ? sendersParam.flatMap((v) => String(v).split(","))
    : typeof sendersParam === "string" && sendersParam.length > 0
      ? String(sendersParam).split(",")
      : [];
  // Parse sources from query (supports both repeated and comma-separated)
  const sourcesParam = sp["sources"];
  const selectedSources: string[] = Array.isArray(sourcesParam)
    ? sourcesParam.flatMap((v) => String(v).split(","))
    : typeof sourcesParam === "string" && sourcesParam.length > 0
      ? String(sourcesParam).split(",")
      : [];
  // Parse message types from query (supports both repeated and comma-separated)
  const typesParam = sp["types"];
  const rawSelectedTypes: string[] = Array.isArray(typesParam)
    ? typesParam.flatMap((v) => String(v).split(","))
    : typeof typesParam === "string" && typesParam.length > 0
      ? String(typesParam).split(",")
      : [];
  // Only allow known types we expose in the UI
  const selectedTypes: string[] = rawSelectedTypes.filter((t) => {
    const v = t.toLowerCase();
    return v === "email" || v === "sms";
  });
  const page = Number(pageParam) || 1;
  const pageSize = Number(limitParam) || 20;
  const q = (qParam || "").toString();
  const { items, total, limit, hasMore } = await loadCases(page, pageSize, q, selectedCodes, selectedSenders, selectedSources, selectedTypes, base);
  const activeFilterCount =
    (q ? 1 : 0) +
    selectedSenders.length +
    selectedSources.length +
    selectedTypes.length +
    selectedCodes.length;

  return (
    <div className="flex flex-col min-h-screen bg-background" data-theme="v2">
      <Header isHomepage={false} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-12 md:py-16 border-b border-border/40 bg-secondary/20">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
              <div>
                <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
                  <span>/</span>
                  <span className="text-foreground">Cases</span>
                </nav>
                <h1 
                  className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1]"
                  style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
                >
                  All Cases
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Browse all submitted fundraising messages and detected violations.
                </p>
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                {total} total cases
              </div>
            </div>

            {/* Mobile filters – collapsible panel */}
            <div className="sm:hidden mb-4">
              <details className="[&_summary::-webkit-details-marker]:hidden border border-border rounded-md bg-background">
                <summary className="list-none px-4 py-2.5 text-sm flex items-center justify-between cursor-pointer select-none">
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="ml-2 rounded-full bg-primary text-primary-foreground text-[11px] px-2 py-0.5">
                      {activeFilterCount}
                    </span>
                  )}
                </summary>
                <div className="border-t border-border p-4 space-y-6 max-h-[70vh] overflow-y-auto bg-card">
                  {/* Senders */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Senders
                    </h3>
                    <SenderSearchCombobox
                      selectedSenders={selectedSenders}
                      pageSize={pageSize}
                      codes={selectedCodes}
                      sources={selectedSources}
                    />
                  </div>

                  {/* Source */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Source
                    </h3>
                    <form action="/cases" method="get" className="space-y-3">
                      <input type="hidden" name="page" value="1" />
                      <input type="hidden" name="limit" value={String(pageSize)} />
                      {q && <input type="hidden" name="q" value={q} />}
                      {selectedSenders.map((sender) => (
                        <input key={`m-sender-${sender}`} type="hidden" name="senders" value={sender} />
                      ))}
                      {selectedCodes.map((code) => (
                        <input key={`m-code-${code}`} type="hidden" name="codes" value={code} />
                      ))}
                      {selectedTypes.map((type) => (
                        <input key={`m-type-${type}`} type="hidden" name="types" value={type} />
                      ))}
                      <div className="grid grid-cols-1 gap-2">
                        <label className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            name="sources"
                            value="user_submitted"
                            defaultChecked={selectedSources.includes("user_submitted")}
                            className="accent-primary"
                          />
                          <span className="truncate">User Submitted</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            name="sources"
                            value="bot_submitted"
                            defaultChecked={selectedSources.includes("bot_submitted")}
                            className="accent-primary"
                          />
                          <span className="truncate">Bot Captured</span>
                        </label>
                      </div>
                      <div className="flex gap-2 justify-end pt-2">
                        <a
                          href={`/cases?page=1&limit=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${selectedSenders.length > 0 ? `&senders=${selectedSenders.join(",")}` : ""}${selectedCodes.length > 0 ? `&codes=${selectedCodes.join(",")}` : ""}${selectedTypes.length > 0 ? `&types=${selectedTypes.join(",")}` : ""}`}
                          className="text-sm px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                        >
                          Clear
                        </a>
                        <button
                          type="submit"
                          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          Apply
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Violations */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Violations
                    </h3>
                    <CasesFilterForm
                      pageSize={pageSize}
                      q={q}
                      selectedSenders={selectedSenders}
                      selectedCodes={selectedCodes}
                      selectedSources={selectedSources}
                      selectedTypes={selectedTypes}
                    />
                  </div>
                </div>
              </details>
            </div>

            {/* Desktop / tablet filters – original layout, hidden on mobile */}
            <div className="hidden sm:flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <SenderSearchCombobox selectedSenders={selectedSenders} pageSize={pageSize} codes={selectedCodes} sources={selectedSources} />
              
              {/* Channel (message type) dropdown – matches other filters, desktop only */}
              <div className="relative">
                <details className="[&_summary::-webkit-details-marker]:hidden">
                  <summary className="list-none text-sm px-4 py-2.5 rounded-md border border-border bg-background text-foreground hover:bg-secondary/50 inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap transition-colors">
                    <span>Channel</span>
                    {selectedTypes.length > 0 && (
                      <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">{selectedTypes.length}</span>
                    )}
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 z-20 rounded-lg border border-border bg-card p-3 shadow-lg">
                    <form action="/cases" method="get" className="space-y-3">
                      <input type="hidden" name="page" value="1" />
                      <input type="hidden" name="limit" value={String(pageSize)} />
                      {q && <input type="hidden" name="q" value={q} />}
                      {selectedSenders.map((sender) => (
                        <input key={`type-sender-${sender}`} type="hidden" name="senders" value={sender} />
                      ))}
                      {selectedCodes.map((code) => (
                        <input key={`type-code-${code}`} type="hidden" name="codes" value={code} />
                      ))}
                      {selectedSources.map((source) => (
                        <input key={`type-source-${source}`} type="hidden" name="sources" value={source} />
                      ))}
                      <div className="grid grid-cols-1 gap-2">
                        <label className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            name="types"
                            value="email"
                            defaultChecked={selectedTypes.includes("email")}
                            className="accent-primary"
                          />
                          <span className="truncate">Email</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            name="types"
                            value="sms"
                            defaultChecked={selectedTypes.includes("sms")}
                            className="accent-primary"
                          />
                          <span className="truncate">SMS</span>
                        </label>
                      </div>
                      <div className="flex gap-2 justify-end pt-2">
                        <a
                          href={`/cases?page=1&limit=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${selectedSenders.length > 0 ? `&senders=${selectedSenders.join(",")}` : ""}${selectedCodes.length > 0 ? `&codes=${selectedCodes.join(",")}` : ""}${selectedSources.length > 0 ? `&sources=${selectedSources.join(",")}` : ""}`}
                          className="text-sm px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                        >
                          Clear
                        </a>
                        <button
                          type="submit"
                          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          Apply
                        </button>
                      </div>
                    </form>
                  </div>
                </details>
              </div>

              {/* Source dropdown */}
              <div className="relative">
                <details className="[&_summary::-webkit-details-marker]:hidden">
                  <summary className="list-none text-sm px-4 py-2.5 rounded-md border border-border bg-background text-foreground hover:bg-secondary/50 inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap transition-colors">
                    <span>Source</span>
                    {selectedSources.length > 0 && (
                      <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">{selectedSources.length}</span>
                    )}
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 z-20 rounded-lg border border-border bg-card p-3 shadow-lg">
                    <form action="/cases" method="get" className="space-y-3">
                      <input type="hidden" name="page" value="1" />
                      <input type="hidden" name="limit" value={String(pageSize)} />
                      {q && <input type="hidden" name="q" value={q} />}
                      {selectedSenders.map((sender) => (
                        <input key={`sender-${sender}`} type="hidden" name="senders" value={sender} />
                      ))}
                      {selectedCodes.map((code) => (
                        <input key={`code-${code}`} type="hidden" name="codes" value={code} />
                      ))}
                      {selectedTypes.map((type) => (
                        <input key={`type-${type}`} type="hidden" name="types" value={type} />
                      ))}
                      <div className="grid grid-cols-1 gap-2">
                        <label className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                          <input 
                            type="checkbox" 
                            name="sources" 
                            value="user_submitted" 
                            defaultChecked={selectedSources.includes("user_submitted")} 
                            className="accent-primary"
                          />
                          <span className="truncate">User Submitted</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2 hover:bg-secondary/50 cursor-pointer transition-colors">
                          <input 
                            type="checkbox" 
                            name="sources" 
                            value="bot_submitted" 
                            defaultChecked={selectedSources.includes("bot_submitted")} 
                            className="accent-primary"
                          />
                          <span className="truncate">Bot Captured</span>
                        </label>
                      </div>
                      <div className="flex gap-2 justify-end pt-2">
                        <a href={`/cases?page=1&limit=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}${selectedSenders.length > 0 ? `&senders=${selectedSenders.join(",")}` : ""}${selectedCodes.length > 0 ? `&codes=${selectedCodes.join(",")}` : ""}${selectedTypes.length > 0 ? `&types=${selectedTypes.join(",")}` : ""}`} className="text-sm px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">Clear</a>
                        <button type="submit" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Apply</button>
                      </div>
                    </form>
                  </div>
                </details>
              </div>

              {/* Violations dropdown */}
              <div className="relative">
                <details className="[&_summary::-webkit-details-marker]:hidden">
                  <summary className="list-none text-sm px-4 py-2.5 rounded-md border border-border bg-background text-foreground hover:bg-secondary/50 inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap transition-colors">
                    <span>Violations</span>
                    {selectedCodes.length > 0 && (
                      <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">{selectedCodes.length}</span>
                    )}
                  </summary>
                  <div className="absolute right-0 mt-2 w-72 z-20 rounded-lg border border-border bg-card p-3 shadow-lg md:w-80">
                    <CasesFilterForm
                      pageSize={pageSize}
                      q={q}
                      selectedSenders={selectedSenders}
                      selectedCodes={selectedCodes}
                      selectedSources={selectedSources}
                      selectedTypes={selectedTypes}
                    />
                  </div>
                </details>
              </div>
            </div>
          </div>
        </section>

        {/* Cases List */}
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            {items.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground">No cases found.</p>
              </div>
            ) : (
              <>
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                  <div className="divide-y divide-border">
                    {items.map((it) => (
                      <Link 
                        key={it.id} 
                        href={`/cases/${it.id}`} 
                        className="flex items-center justify-between gap-4 px-6 py-5 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate max-w-[60vw]">
                            {it.senderName || it.senderId || "Unknown sender"}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                            {it.issues.length === 0 ? (
                              <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground border border-border">
                                No Violations Detected
                              </span>
                            ) : (
                              <>
                                {it.issues.map((v, idx) => {
                                  const policy = VIOLATION_POLICIES.find((p) => p.code === v.code);
                                  const isVerified = v.actblue_verified === true;
                                  return (
                                    <HoverCard key={`${v.code}-${idx}`} openDelay={200}>
                                      <HoverCardTrigger asChild>
                                        <span
                                          title={v.code}
                                          className={`${idx > 0 ? "hidden md:inline-flex" : "inline-flex"} items-center rounded-full px-2.5 py-1 text-[11px] font-medium border max-w-[80%] md:max-w-none min-w-0 cursor-help ${
                                            isVerified
                                              ? 'bg-accent/50 text-accent-foreground border-accent'
                                              : 'bg-destructive/10 text-destructive border-destructive/30'
                                          }`}
                                        >
                                          <span className="truncate">
                                            {isVerified ? 'ActBlue Permitted Matching Program' : v.title}
                                          </span>
                                        </span>
                                      </HoverCardTrigger>
                                      {policy && (
                                        <HoverCardContent className="w-96 bg-card border-border" side="top">
                                          <div className="space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                              <div>
                                                <div className="font-mono text-xs text-muted-foreground">{policy.code}</div>
                                                <div className="font-semibold text-sm text-foreground">
                                                  {isVerified && policy.code === "AB008" ? "Permitted Matching Program" : policy.title}
                                                </div>
                                              </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground leading-relaxed">{policy.policy}</p>
                                            {isVerified && (
                                              <div className="text-xs text-accent-foreground bg-accent/30 p-2 rounded border border-accent/50">
                                                Based on evidence patterns we&apos;ve observed, this sender appears to meet ActBlue&apos;s standards for donation matching programs.
                                              </div>
                                            )}
                                            <a
                                              href={AUP_HELP_URL}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                            >
                                              View full policy
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                              </svg>
                                            </a>
                                          </div>
                                        </HoverCardContent>
                                      )}
                                    </HoverCard>
                                  );
                                })}
                                {it.issues.length > 1 && (
                                  <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive border border-destructive/30 md:hidden">+{it.issues.length - 1} more</span>
                                )}
                              </>
                            )}
                            {/* Desktop-only badges for type and submission source */}
                            {(() => {
                              const type = (it.messageType || '').toLowerCase();
                              const showType = type && type !== 'unknown';
                              const isBot = isBotSubmitted({
                                messageType: it.messageType,
                                imageUrl: it.imageUrl,
                                senderId: it.senderId,
                                forwarderEmail: it.forwarderEmail,
                              });
                              return (
                                <>
                                  {showType && (
                                    <span className="hidden md:inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground border border-border">
                                      {type === 'email' && 'Email'}
                                      {type === 'sms' && 'SMS'}
                                      {type === 'mms' && 'MMS'}
                                    </span>
                                  )}
                                  <span className="hidden md:inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground border border-border">
                                    {isBot ? 'Bot Captured' : 'User Submitted'}
                                  </span>
                                  {it.hasReport && (
                                    <span className="hidden md:inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary border border-primary/30">
                                      Reported to ActBlue
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground truncate max-w-[70ch]">
                            {derivePreview(it.rawText) || "(no text)"}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-xs text-muted-foreground tabular-nums hidden sm:block">{formatWhen(it.createdAt)}</div>
                          <span className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground pointer-events-none">
                            View
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Pagination */}
                <div className="mt-8 flex items-center justify-center">
                  <PaginationControls
                    total={total}
                    pageSize={limit}
                    currentPage={page}
                    hasMore={hasMore}
                    q={q}
                    senders={selectedSenders}
                    codes={selectedCodes}
                    sources={selectedSources}
                    types={selectedTypes}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function PaginationControls({ total, pageSize, currentPage, hasMore, q, senders, codes, sources, types }: { total: number; pageSize: number; currentPage: number; hasMore: boolean; q?: string; senders?: string[]; codes?: string[]; sources?: string[]; types?: string[] }) {
  const base = "/cases";
  const prevPage = Math.max(1, currentPage - 1);
  const nextPage = currentPage + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  
  const buildUrl = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (q) params.set("q", q);
    if (senders && senders.length > 0) params.set("senders", senders.join(","));
    if (codes && codes.length > 0) params.set("codes", codes.join(","));
    if (sources && sources.length > 0) params.set("sources", sources.join(","));
    if (types && types.length > 0) params.set("types", types.join(","));
    return `${base}?${params.toString()}`;
  };
  
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link
        href={buildUrl(prevPage)}
        className={`px-4 py-2 rounded-md border transition-colors ${currentPage <= 1 ? "text-muted-foreground/50 border-border/50 pointer-events-none cursor-not-allowed" : "text-foreground border-border hover:bg-secondary/50"}`}
        aria-disabled={currentPage <= 1}
      >
        Previous
      </Link>
      <span className="text-muted-foreground px-2">Page {currentPage} of {totalPages}</span>
      <Link
        href={buildUrl(nextPage)}
        className={`px-4 py-2 rounded-md border transition-colors ${!hasMore ? "text-muted-foreground/50 border-border/50 pointer-events-none cursor-not-allowed" : "text-foreground border-border hover:bg-secondary/50"}`}
        aria-disabled={!hasMore}
      >
        Next
      </Link>
    </div>
  );
}
