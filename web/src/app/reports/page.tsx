import { Metadata } from "next";
import { headers } from "next/headers";
import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";
import ReportsTable from "./ReportsTable";
import AboutReportingCard from "./AboutReportingCard";

export const metadata: Metadata = {
  title: "Reports to ActBlue",
  description:
    "Transparent tracking of all reports submitted to ActBlue, including evidence and determinations.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function ReportsPage() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  
  const res = await fetch(`${base}/api/reports`, { cache: "no-store" });
  const data = res.ok ? await res.json() : { reports: [] };

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
                Reports to ActBlue
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Record of all reports submitted to ActBlue through our platform, including evidence and outcomes.
              </p>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="py-12 md:py-16 border-b border-border/40">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            <AboutReportingCard />
          </div>
        </section>

        {/* Reports Table Section */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            <div className="bg-card border border-border rounded-lg p-6 md:p-8 shadow-sm">
              <ReportsTable initialData={data.reports || []} />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
