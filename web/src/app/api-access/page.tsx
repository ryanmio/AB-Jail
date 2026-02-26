"use client";

import { useState, FormEvent } from "react";
import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";

const BASE_URL = "https://abjail.org";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/submissions",
    description: "List all public submissions with pagination and filtering.",
    params: [
      { name: "limit", type: "number", desc: "Results per page (max 100, default 20)" },
      { name: "offset", type: "number", desc: "Number of results to skip" },
      { name: "sender_name", type: "string", desc: "Filter by sender name (partial match)" },
      { name: "sender_id", type: "string", desc: "Filter by sender ID (partial match)" },
      { name: "message_type", type: "string", desc: "Filter by type: sms, email, unknown" },
      { name: "date_from", type: "ISO 8601", desc: "Start date filter (inclusive)" },
      { name: "date_to", type: "ISO 8601", desc: "End date filter (inclusive)" },
      { name: "has_violations", type: "boolean", desc: "Filter to only submissions with/without violations" },
      { name: "q", type: "string", desc: "Search sender name, sender ID, or message text" },
    ],
    fields: "id, created_at, email_sent_at, sort_date, sender_id, sender_name, message_type, raw_text, ai_summary, email_subject, email_body, links, media_urls, is_fundraising, landing_url, image_url, landing_screenshot_url",
  },
  {
    method: "GET",
    path: "/api/v1/submissions/:id",
    description: "Get a single submission with its violations, reports, verdicts, and comments.",
    params: [],
    fields: "All submission fields plus nested violations[], reports[], verdicts[], comments[]",
  },
  {
    method: "GET",
    path: "/api/v1/violations",
    description: "List all detected violations across submissions.",
    params: [
      { name: "code", type: "string", desc: "Filter by violation code (e.g. AB001, AB003). Comma-separated for multiple." },
      { name: "submission_id", type: "uuid", desc: "Filter by submission" },
      { name: "severity_min", type: "number", desc: "Minimum severity (1-5)" },
      { name: "actblue_verified", type: "boolean", desc: "Filter by ActBlue verification status" },
      { name: "limit", type: "number", desc: "Results per page (max 100)" },
      { name: "offset", type: "number", desc: "Number of results to skip" },
    ],
    fields: "id, submission_id, code, title, description, evidence_spans, severity, confidence, actblue_verified",
  },
  {
    method: "GET",
    path: "/api/v1/reports",
    description: "List violation reports filed to ActBlue.",
    params: [
      { name: "case_id", type: "uuid", desc: "Filter by submission/case ID" },
      { name: "status", type: "string", desc: "Filter by status: sent, failed, responded, queued" },
      { name: "limit", type: "number", desc: "Results per page (max 100)" },
      { name: "offset", type: "number", desc: "Number of results to skip" },
    ],
    fields: "id, case_id, to_email, cc_email, subject, body, html_body, landing_url, status, created_at",
  },
  {
    method: "GET",
    path: "/api/v1/verdicts",
    description: "List ActBlue's verdicts on filed reports.",
    params: [
      { name: "case_id", type: "uuid", desc: "Filter by submission/case ID" },
      { name: "verdict", type: "string", desc: "Filter: violation_confirmed, no_violation, pending, under_review, resolved" },
      { name: "limit", type: "number", desc: "Results per page (max 100)" },
      { name: "offset", type: "number", desc: "Number of results to skip" },
    ],
    fields: "id, case_id, verdict, explanation, determined_by, created_at, updated_at",
  },
  {
    method: "GET",
    path: "/api/v1/comments",
    description: "List comments on submissions.",
    params: [
      { name: "submission_id", type: "uuid", desc: "Filter by submission" },
      { name: "kind", type: "string", desc: "Filter: user, landing_page" },
      { name: "limit", type: "number", desc: "Results per page (max 100)" },
      { name: "offset", type: "number", desc: "Number of results to skip" },
    ],
    fields: "id, submission_id, content, kind, created_at",
  },
  {
    method: "GET",
    path: "/api/v1/stats",
    description: "Aggregate statistics across all data.",
    params: [
      { name: "range", type: "string", desc: "Time range: 7, 30, 90, or lifetime (default 30)" },
      { name: "sender", type: "string", desc: "Filter by sender name. Repeat for multiple." },
      { name: "violation", type: "string", desc: "Filter by violation code. Repeat for multiple." },
    ],
    fields: "Aggregate KPIs, time-series data, violation breakdowns",
  },
  {
    method: "GET",
    path: "/api/v1/exemptions",
    description: "List sender violation exemptions (policy transparency).",
    params: [
      { name: "limit", type: "number", desc: "Results per page (max 100)" },
      { name: "offset", type: "number", desc: "Number of results to skip" },
    ],
    fields: "id, sender_pattern, violation_code, reason, created_at",
  },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function EndpointCard({ endpoint }: { endpoint: typeof ENDPOINTS[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
      >
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-600 text-white shrink-0">
          {endpoint.method}
        </span>
        <span className="font-mono text-sm text-foreground">{endpoint.path}</span>
        <span className="ml-auto text-muted-foreground text-xs">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border/40 space-y-3">
          <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          {endpoint.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Query Parameters</h4>
              <div className="space-y-1">
                {endpoint.params.map((p) => (
                  <div key={p.name} className="flex gap-2 text-sm">
                    <code className="text-blue-400 font-mono shrink-0">{p.name}</code>
                    <span className="text-muted-foreground text-xs mt-0.5">({p.type})</span>
                    <span className="text-muted-foreground">&mdash; {p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Response Fields</h4>
            <p className="text-sm text-muted-foreground font-mono">{endpoint.fields}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestKeyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [useCase, setUseCase] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/api-key-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, organization: org || undefined, use_case: useCase }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-lg font-semibold text-foreground">Request Submitted</p>
        <p className="text-muted-foreground">We&apos;ll review your request and email your API key shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Email *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="jane@newsroom.org"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Organization</label>
        <input
          type="text"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="The Daily News (optional)"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">How will you use the API? *</label>
        <textarea
          required
          rows={3}
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder="Describe your intended use (e.g., investigative reporting, academic research, data analysis...)"
        />
      </div>
      <button
        type="submit"
        disabled={status === "sending"}
        className="px-6 py-2.5 rounded-md bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {status === "sending" ? "Submitting..." : "Request API Key"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-500">Something went wrong. Please try again or email us directly.</p>
      )}
    </form>
  );
}

export default function ApiAccessPage() {
  return (
    <div className="flex flex-col min-h-screen" data-theme="v2">
      <Header isHomepage={false} />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-16 md:py-24 border-b border-border/40 bg-secondary/20">
          <div className="container mx-auto px-6 md:px-12 max-w-4xl">
            <div className="text-center space-y-4">
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]"
                style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
              >
                API Access
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Programmatic access to AB Jail&apos;s database for reporters, researchers, and anyone
                building on this data. Read-only, authenticated via API key.
              </p>
            </div>
          </div>
        </section>

        {/* Request Key - prominent CTA right after hero */}
        <section className="py-12 md:py-16 border-b border-border/40">
          <div className="container mx-auto px-6 md:px-12 max-w-4xl space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Request an API Key</h2>
            <p className="text-sm text-muted-foreground">
              API keys are free and issued manually. Fill out the form below and we&apos;ll email you a key, usually within 24 hours.
            </p>
            <div className="border border-border/60 rounded-lg p-6 bg-background">
              <RequestKeyForm />
            </div>
          </div>
        </section>

        {/* Quick Start */}
        <section className="py-12 md:py-16 border-b border-border/40 bg-secondary/10">
          <div className="container mx-auto px-6 md:px-12 max-w-4xl space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Quick Start</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">1. Authentication</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  All requests require an API key. Pass it via the <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">Authorization</code> header:
                </p>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${BASE_URL}/api/v1/submissions?limit=5"`}</CodeBlock>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">2. Response Format</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  All list endpoints return paginated JSON:
                </p>
                <CodeBlock>{`{
  "data": [ ... ],
  "pagination": {
    "total": 1234,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}`}</CodeBlock>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">3. Pagination</h3>
                <p className="text-sm text-muted-foreground">
                  Use <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">limit</code> (max 100) and{" "}
                  <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">offset</code> query parameters.
                  Check <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">pagination.has_more</code> to
                  determine if more pages exist.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Examples */}
        <section className="py-12 md:py-16 border-b border-border/40">
          <div className="container mx-auto px-6 md:px-12 max-w-4xl space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Examples</h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Get recent submissions with violations:</p>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${BASE_URL}/api/v1/submissions?has_violations=true&limit=10"`}</CodeBlock>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Get a specific submission with all related data:</p>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${BASE_URL}/api/v1/submissions/SUBMISSION_UUID"`}</CodeBlock>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Search for a sender:</p>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${BASE_URL}/api/v1/submissions?sender_name=ActBlue&limit=20"`}</CodeBlock>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Get ActBlue-verified violations:</p>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${BASE_URL}/api/v1/violations?actblue_verified=true"`}</CodeBlock>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Get lifetime stats:</p>
                <CodeBlock>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${BASE_URL}/api/v1/stats?range=lifetime"`}</CodeBlock>
              </div>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section className="py-12 md:py-16 border-b border-border/40 bg-secondary/10">
          <div className="container mx-auto px-6 md:px-12 max-w-4xl space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Endpoints</h2>
            <p className="text-sm text-muted-foreground">
              All endpoints are read-only (GET). Click an endpoint to see its parameters and response fields.
            </p>
            <div className="space-y-2">
              {ENDPOINTS.map((ep) => (
                <EndpointCard key={ep.path} endpoint={ep} />
              ))}
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="py-12 md:py-16 border-b border-border/40 bg-secondary/10">
          <div className="container mx-auto px-6 md:px-12 max-w-4xl space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Notes</h2>
            <ul className="space-y-3 text-sm text-muted-foreground list-disc list-inside">
              <li>
                <strong>Image URLs</strong> for submissions and landing page screenshots are returned as
                temporary signed URLs that expire after 1 hour. Re-request the resource to get a fresh URL.
              </li>
              <li>
                <strong>Privacy</strong>: Submitter-identifying fields (forwarder email, uploader fingerprint)
                are never exposed through the API.
              </li>
              <li>
                <strong>Rate limits</strong>: There are no hard rate limits, but we monitor usage.
                Please be respectful and avoid excessive polling. If you need bulk data, paginate
                through results rather than making parallel requests.
              </li>
              <li>
                <strong>Errors</strong> return a JSON object with an <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">error</code> field
                containing <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">code</code> and <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">message</code>.
              </li>
              <li>
                <strong>Versioning</strong>: The API is versioned at <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/api/v1/</code>.
                Breaking changes will result in a new version.
              </li>
            </ul>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-6 md:px-12 max-w-4xl text-center space-y-3">
            <p className="text-muted-foreground">
              Ready to get started?{" "}
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-blue-500 hover:text-blue-400 underline underline-offset-2"
              >
                Request an API key
              </button>{" "}
              at the top of this page.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
