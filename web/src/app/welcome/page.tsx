import Link from "next/link";
import { Metadata } from "next";
import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";
import { VIOLATION_POLICIES, AUP_HELP_URL } from "@/lib/violation-policies";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Submit fundraising messages or browse real-time feeds. AB Jail uses AI to flag potential ActBlue policy violations in political campaigns.",
};

export default function WelcomePage() {
  return (
    <div className="flex flex-col min-h-screen" data-theme="v2">
      <Header isHomepage={false} />

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 md:py-24 border-b border-border/40 bg-secondary/20">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            <div className="text-center space-y-4">
              <h1 
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]" 
                style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
              >
                How it works
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Not affiliated with ActBlue.
              </p>
            </div>
          </div>
        </section>

        {/* Content Sections */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl space-y-12 md:space-y-16">
            {/* Quick start */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-xl font-semibold text-foreground mb-4">Quick start</h2>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>Forward a fundraising email to <code className="bg-secondary px-1.5 py-0.5 rounded text-sm font-mono">submit@abjail.org</code> <em>or</em> upload a screenshot.</li>
                <li>We process it, create a public case, and flag potential policy issues.</li>
                <li>
                  Submit the report to ActBlue:
                  <span className="block pl-5 mt-1">
                    • If you <strong className="text-foreground">forwarded</strong>, use the &ldquo;Submit to ActBlue&rdquo; link in the email we send you.<br />
                    • If you <strong className="text-foreground">uploaded</strong>, click <em>Submit to ActBlue</em> on the case page.
                  </span>
                  We&apos;ll track any replies on the case.
                </li>
              </ol>
            </div>

            {/* How to submit */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How to submit a message
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                There are three ways to submit a political fundraising message:
              </p>

              <div className="space-y-6">
                {/* Forward email (BEST) */}
                <div className="border border-border rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                    <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Forward email <span className="ml-2 text-xs font-medium text-primary-foreground bg-primary rounded px-2 py-0.5">Best fidelity</span>
                  </h3>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    Forward suspicious fundraising emails to{" "}
                    <code className="bg-secondary px-2 py-1 rounded text-sm font-mono">submit@abjail.org</code>. 
                    This preserves headers, formatting, links, and images so we can prepare a ready-to-send report.
                  </p>
                  <p className="text-sm text-muted-foreground/80">
                    Recommended for email: most complete record and fastest reporting flow.
                  </p>
                </div>

                {/* Screenshot upload (BEST FOR SMS) */}
                <div className="border border-border rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                    <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Screenshot upload <span className="ml-2 text-xs font-medium text-primary-foreground bg-primary rounded px-2 py-0.5">Best for SMS</span>
                  </h3>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    Capture the text thread or email view and drag it into the uploader. We support PNG, JPG, HEIC, and single-page PDF up to 10MB.
                  </p>
                  <p className="text-sm text-muted-foreground/80">
                    Recommended for SMS/MMS and social screenshots. Preserves layout and images, but not email headers.
                  </p>
                </div>
              </div>
            </div>

            {/* What happens after you submit */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                What happens after you submit
              </h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-sm">1</div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">We capture the content</h3>
                    <p className="text-muted-foreground">Screenshots go through Optical Character Recognition (OCR); forwarded emails keep their original formatting. The raw text and media are stored on the case.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-sm">2</div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">We extract additional context</h3>
                    <p className="text-muted-foreground">If an ActBlue landing page URL is detected, we automatically capture a screenshot for context. For forwarded emails, we also reduce personalized content (like your name) to protect your privacy.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-sm">3</div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">AI flags potential issues</h3>
                    <p className="text-muted-foreground">A lightweight check confirms it&apos;s fundraising; a deeper check highlights potential violations (e.g., fake matches, deceptive urgency).</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-sm">4</div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">A public case is created</h3>
                    <p className="text-muted-foreground">The case shows evidence (text/screenshot), flagged issues, and the landing-page snapshot for context.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-sm">5</div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Report to ActBlue</h3>
                    <p className="text-muted-foreground">From the case page, click <em>Submit to ActBlue</em>. We prefill campaign name, message text or screenshot, landing page, and a case link. Replies from ActBlue are attached back to the case.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Reporting violations to ActBlue */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Reporting violations to ActBlue
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We make reporting fast and consistent by pre-filling the details ActBlue needs to investigate—so you can submit in seconds and track responses in one place.
              </p>
              
              <div className="bg-secondary/30 border border-border rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-foreground mb-3">Email-Only Workflow (Easiest)</h3>
                <ol className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2"><span className="font-semibold text-foreground">1.</span><span>Forward a suspicious email to <code className="bg-secondary px-2 py-0.5 rounded text-sm font-mono">submit@abjail.org</code>.</span></li>
                  <li className="flex gap-2"><span className="font-semibold text-foreground">2.</span><span>We process it and email you the case.</span></li>
                  <li className="flex gap-2"><span className="font-semibold text-foreground">3.</span><span>Click the <em>Submit to ActBlue</em> link to file your report.</span></li>
                </ol>
                <p className="text-sm text-muted-foreground mt-3">
                  No website visit required. The entire process happens via email.
                </p>
              </div>

              <div className="border border-border rounded-lg p-6">
                <h3 className="font-semibold text-foreground mb-3">Website Workflow</h3>
                <ol className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">1.</span>
                    <span>Upload via website or forward an email</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">2.</span>
                    <span>View the case on AB Jail</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">3.</span>
                    <span>Click &ldquo;Submit to ActBlue&rdquo; button on the case page</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-foreground">4.</span>
                    <span>Review the pre-filled report and submit</span>
                  </li>
                </ol>
              </div>
            </div>

            {/* How we flag potential violations */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How we flag potential violations
              </h2>
              <div className="mb-4 rounded-md border border-border bg-secondary/30 p-4 text-muted-foreground">
                <h3 className="font-semibold text-foreground mb-1">How detection works</h3>
                <p className="text-sm">
                  We use AI to review each fundraising solicitation in context. First we extract the text and capture a snapshot of the donation page. The AI compares that evidence to ActBlue&apos;s Account Use Policy (AUP) and our focused policy patterns, then returns potential flags with a short rationale.
                </p>
              </div>

              <div className="divide-y divide-border rounded-md border border-border">
                {VIOLATION_POLICIES.map((v) => (
                  <details key={v.code} className="group">
                    <summary className="flex w-full items-center justify-between cursor-pointer list-none px-4 py-3 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-1.5 bg-destructive rounded" />
                        <span className="font-semibold text-foreground">{v.title}</span>
                      </div>
                      <svg className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="px-4 pb-4">
                      <p className="text-sm text-muted-foreground mb-2">{v.policy}</p>
                      <a href={AUP_HELP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                        View full ActBlue AUP
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3h7m0 0v7m0-7L10 14" />
                        </svg>
                      </a>
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {/* Real-time monitoring */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Real-time monitoring through bots
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Beyond user submissions, AB Jail continuously monitors fundraising at scale using seeded phone numbers and email addresses. These &ldquo;honeytrap&rdquo; accounts subscribe to campaigns, PACs, and list sellers, capturing solicitations automatically.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                All collected messages undergo the same AI analysis as manual submissions, appearing in the public database with the same violation flags and context. This two-pronged approach ensures we catch both individual cases flagged by donors and systemic patterns across campaigns.
              </p>
              <div className="bg-secondary/30 border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Browse by source:</span> On the <Link href="/cases" className="text-primary hover:underline">cases page</Link>, filter by &ldquo;user submitted&rdquo; or &ldquo;automated collection&rdquo; to see which messages came from donors and which from our monitoring systems.
                </p>
              </div>
            </div>

            {/* Get involved */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Get involved
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                AB Jail is open source and community-driven. You can help improve the project by:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground mb-4">
                <li>Submitting cases to build our public database</li>
                <li>Reporting bugs or requesting features</li>
                <li>Contributing to AI training by evaluating classification accuracy</li>
                <li>Contributing code on GitHub</li>
              </ul>
              <div className="flex gap-3 flex-wrap">
                <Link
                  href="/evaluation"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors"
                >
                  AI Training
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2 border border-primary text-primary bg-background/50 rounded-sm hover:bg-primary/5 transition-colors inline-flex items-center gap-2"
                >
                  Submit a case
                </Link>
                <a
                  href="https://github.com/ryanmio/ActBlue-Jail"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 border border-primary text-primary bg-background/50 rounded-sm hover:bg-primary/5 transition-colors inline-flex items-center gap-2"
                >
                  Code on GitHub
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Questions */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Questions?
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For more information about the project, see our{" "}
                <Link href="/about" className="text-primary hover:underline">
                  About page
                </Link>
                . For technical discussions or support, visit our{" "}
                <a
                  href="https://github.com/ryanmio/ActBlue-Jail/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub Discussions
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
