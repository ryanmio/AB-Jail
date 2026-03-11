"use client";

import { Suspense } from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";
import { useFilters, useStats } from "./_lib/use-stats";
import { StatsFilters } from "./_components/filters";
import { KpiCards, SenderTable, DataRequestSection } from "./_components/tables-and-cards";
import {
  EnforcementFunnel,
  TimelineChart,
  ViolationMixChart,
  ViolationTrendsChart,
  ChannelTrendsChart,
  SourceTrendsChart,
  DomainChart,
  SenderConcentrationChart,
} from "./_components/charts";

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function AnimatedSection({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StatsPageContent() {
  const filters = useFilters();
  const { data, advancedData, loading, error, allSenders } = useStats(filters);

  return (
    <div className="flex flex-col min-h-screen" data-theme="v2">
      <Header isHomepage={false} />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-12 md:py-20 border-b border-border/40 bg-secondary/20">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1] mb-4" 
              style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
            >
              Statistics
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
              Public transparency data on political fundraising communications, policy violations, and enforcement actions
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl space-y-8 md:space-y-12">
            {/* Filters */}
            <StatsFilters
              range={filters.range}
              setRange={filters.setRange}
              selectedViolations={filters.selectedViolations}
              setSelectedViolations={filters.setSelectedViolations}
              selectedSenders={filters.selectedSenders}
              setSelectedSenders={filters.setSelectedSenders}
              selectedSource={filters.selectedSource}
              setSelectedSource={filters.setSelectedSource}
              selectedTypes={filters.selectedTypes}
              setSelectedTypes={filters.setSelectedTypes}
              allSenders={allSenders}
              activeFilterCount={filters.activeFilterCount}
              clearAll={filters.clearAll}
            />

            {/* Loading state */}
            {loading && <LoadingSkeleton />}

            {/* Error state */}
          {error && (
            <div className="bg-card rounded-2xl border border-destructive p-4 md:p-6 text-center">
              <p className="text-xs md:text-sm text-destructive">Error: {error}</p>
            </div>
          )}

            {/* Data */}
          {!loading && !error && data && (
            <>
                <AnimatedSection delay={0}>
                  <KpiCards
                    data={data}
                    showingPermittedOnly={filters.showingPermittedOnly}
                  />
                </AnimatedSection>

                <AnimatedSection delay={0.05}>
                  <EnforcementFunnel
                    totalCaptures={data.kpis.total_captures}
                    capturesWithViolations={data.kpis.captures_with_violations}
                    totalReports={data.kpis.total_reports}
                  />
                </AnimatedSection>

                <AnimatedSection delay={0.1}>
                  <TimelineChart
                capturesBuckets={data.captures_by_bucket || []}
                    violationsBuckets={data.violations_by_bucket || []}
                reportsBuckets={data.reports_by_bucket || []}
                days={data.period.days}
                periodStart={data.period.start}
                periodEnd={data.period.end}
                    showingPermittedOnly={filters.showingPermittedOnly}
              />
                </AnimatedSection>

                <AnimatedSection delay={0.15}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    <ViolationMixChart violations={data.violation_mix || []} />
                    {advancedData && (
                      <ViolationTrendsChart
                        data={advancedData.violations_by_code_by_bucket}
                        days={data.period.days}
                        periodStart={data.period.start}
                        periodEnd={data.period.end}
                      />
                    )}
                    </div>
                </AnimatedSection>

                {advancedData && (
                  <AnimatedSection delay={0.2}>
                    <div className="space-y-8 md:space-y-12">
                      <SenderConcentrationChart senders={advancedData.sender_stats} />
                      <SenderTable senders={advancedData.sender_stats} />
                    </div>
                  </AnimatedSection>
                )}

                {advancedData && (
                  <AnimatedSection delay={0.25}>
                    <DomainChart
                      domains={advancedData.top_domains}
                      actblueUrls={advancedData.top_actblue_urls}
                    />
                  </AnimatedSection>
                )}

                {advancedData && (
                  <AnimatedSection delay={0.3}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                      <ChannelTrendsChart
                        data={advancedData.message_type_by_bucket}
                        days={data.period.days}
                      />
                      <SourceTrendsChart
                        data={advancedData.source_by_bucket}
                        days={data.period.days}
                      />
                      </div>
                  </AnimatedSection>
                )}

                <AnimatedSection delay={0.35}>
                  <DataRequestSection />
                </AnimatedSection>
            </>
          )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      {/* KPI skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={`sk-kpi-${i}`} className="bg-card rounded-2xl border border-border p-6 shadow-sm animate-pulse">
            <div className="h-4 w-28 bg-muted rounded mb-4" />
            <div className="h-10 w-16 bg-muted rounded mb-2" />
            <div className="h-3 w-40 bg-muted rounded" />
    </div>
        ))}
        </div>
      {/* Funnel skeleton */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm animate-pulse">
        <div className="h-5 w-48 bg-muted rounded mb-4" />
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={`sk-fun-${i}`} className="flex-1 h-20 bg-muted/50 rounded-lg" />
          ))}
                      </div>
                      </div>
      {/* Chart skeleton */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm animate-pulse">
        <div className="h-5 w-64 bg-muted rounded mb-4" />
        <div className="h-48 w-full bg-muted/50 rounded" />
                      </div>
      {/* Two-col skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={`sk-pie-${i}`} className="bg-card rounded-2xl border border-border p-6 shadow-sm animate-pulse">
            <div className="h-5 w-40 bg-muted rounded mb-4" />
            <div className="h-[200px] bg-muted/50 rounded" />
                        </div>
        ))}
                      </div>
      {/* Table skeleton */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm animate-pulse">
        <div className="h-5 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((r) => (
            <div key={`sk-row-${r}`} className="h-4 w-full bg-muted/50 rounded" />
        ))}
      </div>
    </div>
    </>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen" data-theme="v2">
        <Header isHomepage={false} />
        <main className="flex-1">
          <section className="py-12 md:py-20 border-b border-border/40 bg-secondary/20">
            <div className="container mx-auto px-6 md:px-12 max-w-6xl">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground leading-[1.1] mb-4"
                style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
                Statistics
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
                Public transparency data on political fundraising communications, policy violations, and enforcement actions
              </p>
        </div>
          </section>
          <section className="py-12 md:py-20">
            <div className="container mx-auto px-6 md:px-12 max-w-6xl">
              <LoadingSkeleton />
                    </div>
          </section>
        </main>
        <Footer />
                  </div>
    }>
      <StatsPageContent />
    </Suspense>
  );
}
