import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";

export default function AboutPage() {
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
                About
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
            {/* What is AB Jail */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-lg font-semibold text-foreground mb-4">What is AB Jail?</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  AB Jail is an open-source, community-led transparency project for political fundraising. Donors – especially elderly small-dollar givers – are being bombarded with deceptive texts and emails that erode trust and poison the well for everyone. AB Jail shines a light on these practices by accepting submissions and monitoring real-time feeds: Forward suspicious emails to <code className="bg-secondary px-1 py-0.5 rounded text-xs font-mono">submit@abjail.org</code>, upload screenshots, or paste text, and AI extracts the sender, flags likely violations of ActBlue&apos;s own published rules, generates a ready-to-send report, and adds the case to a public ledger.
                </p>
                <p>
                  Additionally, AB Jail continuously monitors messages from seeded phone numbers and email addresses subscribed to campaigns, PACs, and list sellers, creating a real-time feed of fundraising solicitations that builds our public database. This two-pronged approach – manual submission and automatic collection – ensures comprehensive coverage of deceptive practices.
                </p>
                <p>
                  The goal is to protect donors and safeguard small-dollar fundraising by making patterns public. The entire project is open-source and community-driven – anyone can audit the <a href="https://github.com/ryanmio/ActBlue-Jail#" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">code</a> or contribute improvements directly.
                </p>
              </div>
            </div>

            {/* Legal Disclaimer */}
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-lg font-semibold text-foreground mb-4">Legal Disclaimer</h2>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div>
                  <h3 className="font-medium text-foreground mb-2">Purpose and scope</h3>
                  <p>
                    AB Jail is an open-source, community-led transparency project that documents potential fundraising policy violations. The site is for research, journalism, and public accountability. It is not a court of law and it does not adjudicate facts.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">No affiliation</h3>
                  <p>
                    AB Jail is not affiliated with ActBlue, ActBlue Civics, ActBlue Charities, Numero, NGP, ClickToWin, or any campaign, PAC, nonprofit, platform, vendor, or payment processor mentioned on this site. References to third-party names, policies, trademarks, or products are for identification and reporting purposes only and do not imply endorsement or association.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">User-submitted and automatically processed content</h3>
                  <p>
                    Materials on this site may include user uploads and messages received by AB Jail via seeded &ldquo;honeytrap&rdquo; phone numbers and email addresses. AB Jail uses automated tools to extract text, identify senders, and label potential policy issues. Automated labels are probabilistic, may be incomplete or incorrect, and should be treated as leads for further review – not as definitive findings.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">No statements of fact about unlawful conduct</h3>
                  <p>
                    Entries on this site describe alleged or potential practices as they appear in the submitted materials and relevant public policies. Unless expressly stated, AB Jail does not assert that any person or entity violated a law or regulation. Descriptions and summaries are presented as opinions based on disclosed facts – namely the quoted message content, links, and screenshots included in each case.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Reporting facilitation only</h3>
                  <p>
                    Where the site generates a prefilled email or other draft to help users report a case to a platform, that draft is a convenience feature. AB Jail does not submit reports on a user&apos;s behalf in the MVP, does not guarantee any outcome, and does not represent any user before any platform or authority.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Uploader representations</h3>
                  <p>
                    By submitting content, uploaders represent and warrant that they have the right to share the materials; that submissions do not include sensitive personal data beyond what is necessary for reporting; and that any personal information of private individuals has been removed or will be redacted. Uploaders agree not to submit malware, illegal content, or knowingly false materials.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Takedown, corrections, and disputes</h3>
                  <p>
                    If you are a referenced individual or organization and believe a case is inaccurate, incomplete, contains privileged or private information, or infringes your rights, contact us at <a href="mailto:democratdonor+legal@gmail.com" className="text-primary hover:underline">democratdonor+legal@gmail.com</a> with the case URL and specific concerns. AB Jail will review good-faith requests and may annotate, correct, redact, or remove content at its discretion. Providing clarifying documentation may expedite resolution.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Trademarks and nominative fair use</h3>
                  <p>
                    &ldquo;ActBlue&rdquo; and other names and logos on this site may be trademarks of their respective owners. AB Jail uses such marks solely to identify the platforms or policies referenced, consistent with nominative fair use. No sponsorship or endorsement is claimed.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">No legal advice</h3>
                  <p>
                    Nothing on this site is legal, financial, or compliance advice. For advice about your specific situation, consult qualified counsel. AB Jail&apos;s contributors and maintainers are not your lawyers.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">No warranties</h3>
                  <p>
                    The site and all content are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; – without warranties of any kind, express or implied, including accuracy, completeness, reliability, or fitness for a particular purpose. AB Jail does not guarantee that any platform will take action on any report.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Limitation of liability</h3>
                  <p>
                    To the maximum extent permitted by law, AB Jail, its contributors, and maintainers are not liable for any indirect, incidental, special, consequential, or exemplary damages, or for any lost profits, goodwill, or data, arising from or related to use of the site or reliance on its content.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Indemnification</h3>
                  <p>
                    By using this site, you agree to indemnify and hold harmless AB Jail, its contributors, and maintainers from any claims, liabilities, damages, losses, and expenses (including reasonable attorneys&apos; fees) arising from your submissions or your use or misuse of the site.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Content moderation</h3>
                  <p>
                    AB Jail may refuse, remove, or restrict content that is abusive, unlawful, defamatory, deceptive, spam, malware, or otherwise inconsistent with the project&apos;s purpose or applicable policies. Moderation decisions are discretionary and may change as new information becomes available.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Governing Law and Venue</h3>
                  <p>
                    These terms and any dispute arising out of or relating to this site are governed by the laws of the District of Columbia, without regard to its conflicts-of-law rules. The exclusive venue for any permitted action shall be the Superior Court of the District of Columbia or, where federal jurisdiction is mandatory, the U.S. District Court for the District of Columbia, and the parties consent to personal jurisdiction in those courts.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium text-foreground mb-2">Contact</h3>
                  <p>
                    For legal, takedown, or correction requests: <a href="mailto:democratdonor+legal@gmail.com" className="text-primary hover:underline">democratdonor+legal@gmail.com</a><br />
                    For press: <a href="mailto:democratdonor+press@gmail.com" className="text-primary hover:underline">democratdonor+press@gmail.com</a>
                  </p>
                </div>
              </div>
            </div>

            {/* Terms of Service */}
            <div id="terms" className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-lg font-semibold text-foreground mb-3">Terms of Service</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  By using this site, you agree to the following terms. If you do not agree, do not use the site.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <span className="font-medium text-foreground">Informational use only</span>: The site is provided for informational purposes and does not
                    constitute legal advice or create any professional relationship.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Your submissions</span>: You represent and warrant that you have all necessary rights to
                    upload and share any content you submit, and that your submissions do not infringe the rights of others
                    or violate any law. You grant us a non-exclusive license to host, display, and process your submissions
                    for the purpose of operating the site.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Acceptable use</span>: Do not upload unlawful, harmful, or malicious content, attempt to
                    disrupt the service, or misuse any data. We may moderate, remove, or restrict content at our discretion.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">No warranties</span>: The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties
                    of any kind. We do not guarantee accuracy, completeness, or fitness for a particular purpose.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Limitation of liability</span>: To the maximum extent permitted by law, we will not be liable
                    for indirect, incidental, special, consequential, or punitive damages, or for loss of data or profits.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Changes</span>: We may update these terms at any time. Continued use of the site after changes
                    take effect constitutes acceptance of the updated terms.
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground/70">Last updated: 2025-08-12</p>
              </div>
            </div>

            {/* Privacy Policy */}
            <div id="privacy" className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
              <h2 className="text-lg font-semibold text-foreground mb-3">Privacy Policy</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  We respect your privacy and describe below what data we collect and how we use it.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <span className="font-medium text-foreground">Data we collect</span>: Content you upload (including images and extracted text), basic
                    metadata (e.g., filenames and timestamps), and technical information such as IP address, device/browser
                    details, and usage logs. Limited analytics may be collected to improve the service.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">How we use data</span>: To operate and improve the site, provide features like OCR and
                    classification, ensure security, and comply with legal obligations.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Sharing</span>: We may share data with service providers (e.g., hosting, storage, analytics)
                    solely to operate the service, and with authorities when required by law. We do not sell your personal
                    information.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Retention</span>: We retain data only as long as necessary for the purposes above or as
                    required by law. You may request removal of content you uploaded, subject to legal and operational limits.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Your choices</span>: You may choose not to upload content that includes personal information.
                    For questions or requests regarding your data, please contact the site maintainers.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Security</span>: We use reasonable safeguards to protect data, but no method of transmission
                    or storage is completely secure.
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground/70">Last updated: 2025-08-12</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
