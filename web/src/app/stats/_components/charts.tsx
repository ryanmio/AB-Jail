"use client";

import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { VIOLATION_POLICIES, AUP_HELP_URL } from "@/lib/violation-policies";
import {
  type AdvancedStatsData,
  CHART_COLORS,
  PIE_COLORS,
  buildKeys,
  normalizeKey,
} from "../_lib/use-stats";

// ──────────────────────────── Enforcement Funnel ────────────────────────────

const MAX_BAR_H = 88;

function funnelBarHeight(value: number, total: number, min: number): number {
  if (total <= 0 || value <= 0) return min;
  return Math.max(min, MAX_BAR_H * (value / total));
}

export function EnforcementFunnel({
  totalCaptures,
  capturesWithViolations,
  totalReports,
}: {
  totalCaptures: number;
  capturesWithViolations: number;
  totalReports: number;
}) {
  const violationPct = totalCaptures > 0
    ? ((capturesWithViolations / totalCaptures) * 100).toFixed(1)
    : "0";
  const reportPct = totalCaptures > 0
    ? ((totalReports / totalCaptures) * 100).toFixed(1)
    : "0";

  // Bar heights scale proportionally to captures, with generous minimums
  // so low-volume stages remain visible but the drop-off is clearly felt.
  const vBarH = funnelBarHeight(capturesWithViolations, totalCaptures, 38);
  const rBarH = funnelBarHeight(totalReports, totalCaptures, 26);

  const stages = [
    {
      label: "Total Captures",
      value: totalCaptures,
      sub: "all political messages",
      barH: MAX_BAR_H,
      color: CHART_COLORS.funnelCaptures,
      pctLabel: null as string | null,
    },
    {
      label: "Violations",
      value: capturesWithViolations,
      sub: `${violationPct}% of captures`,
      barH: vBarH,
      color: CHART_COLORS.funnelViolations,
      pctLabel: `${violationPct}%`,
    },
    {
      label: "Reports Filed",
      value: totalReports,
      sub: `${reportPct}% of captures`,
      barH: rBarH,
      color: CHART_COLORS.funnelReports,
      pctLabel: `${reportPct}%`,
    },
  ];

  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
      <h3
        className="text-base md:text-lg font-semibold text-foreground mb-5 md:mb-7"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
      >
        Enforcement Pipeline
      </h3>

      {/* Mobile: stacked with horizontal bars */}
      <div className="flex flex-col gap-3 md:hidden">
        {stages.map((stage, i) => {
          const pct = totalCaptures > 0 ? (stage.value / totalCaptures) * 100 : 0;
          return (
            <div key={stage.label}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{stage.label}</span>
                <span className="text-lg font-bold text-foreground tabular-nums">{stage.value.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color }}
                />
              </div>
              {stage.pctLabel && <div className="text-xs text-muted-foreground mt-1">{stage.sub}</div>}
              {i < stages.length - 1 && <div className="mt-3 border-t border-border/40" />}
            </div>
          );
        })}
      </div>

      {/* Desktop: step-down bar chart */}
      <div ref={containerRef} className="hidden md:flex items-end" style={{ height: `${MAX_BAR_H + 80}px` }}>
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex-1 flex flex-col justify-between h-full">
            {/* Text at top */}
            <div className="pb-3">
              <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-1">
                {stage.label}
              </div>
              <div className="text-3xl font-bold text-foreground tabular-nums leading-none">
                {stage.value.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1.5">{stage.sub}</div>
            </div>

            {/* Proportional bar rising from bottom, with grow-in animation */}
            <div className="flex items-end gap-0">
              <motion.div
                className="w-full rounded-t-lg"
                initial={{ height: 0 }}
                animate={{ height: visible ? stage.barH : 0 }}
                transition={{ duration: 0.6, delay: i * 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ backgroundColor: stage.color }}
              />
              {/* Narrow gap / connector between bars */}
              {i < stages.length - 1 && (
                <div className="w-2 shrink-0" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: percentage labels below the bars */}
      <div className="hidden md:flex mt-2">
        {stages.map((stage) => (
          <div key={stage.label} className="flex-1 text-xs text-muted-foreground tabular-nums">
            {stage.pctLabel ? (
              <span
                className="inline-block rounded-sm px-1.5 py-0.5 font-medium text-white text-[11px]"
                style={{ backgroundColor: stage.color }}
              >
                {stage.pctLabel}
              </span>
            ) : (
              <span className="text-muted-foreground text-[11px]">100%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────── Timeline Chart ────────────────────────────

export const TimelineChart = memo(function TimelineChart({
  capturesBuckets,
  violationsBuckets,
  reportsBuckets,
  days,
  periodStart,
  periodEnd,
  showingPermittedOnly = false,
}: {
  capturesBuckets: Array<{ bucket: string; count: number }>;
  violationsBuckets: Array<{ bucket: string; count: number }>;
  reportsBuckets: Array<{ bucket: string; count: number }>;
  days: number;
  periodStart?: string;
  periodEnd?: string;
  showingPermittedOnly?: boolean;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const useWeeks = days > 45;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const primaryBuckets = showingPermittedOnly ? capturesBuckets : violationsBuckets;
  const primaryLabel = showingPermittedOnly ? "Captures" : "Violations";

  const cap = new Map(capturesBuckets.map((b) => [normalizeKey(String(b.bucket)), Number(b.count || 0)] as const));
  const primary = new Map(primaryBuckets.map((b) => [normalizeKey(String(b.bucket)), Number(b.count || 0)] as const));
  const rep = new Map(reportsBuckets.map((b) => [normalizeKey(String(b.bucket)), Number(b.count || 0)] as const));

  const allKeys = buildKeys(periodStart, periodEnd, days, primaryBuckets);
  const mergedData = allKeys.map((k) => {
    const captures = cap.get(k) || 0;
    const prim = primary.get(k) || 0;
    return {
      date: k.replace(/^\d{4}-/, ""),
      captures,
      primary: prim,
      reports: rep.get(k) || 0,
      violationRate: captures > 0 ? Math.round((prim / captures) * 100) : 0,
    };
  });

  if (mergedData.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
        <h3 className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4">
          Volume &amp; {primaryLabel} Over Time
        </h3>
        <div className="py-8 md:py-12 text-center text-xs md:text-sm text-muted-foreground">
          No data available
        </div>
      </div>
    );
  }

  const chartConfig = {
    captures: { label: "Total Captures", color: CHART_COLORS.captures },
    primary: { label: primaryLabel, color: CHART_COLORS.violations },
    reports: { label: "Reports", color: CHART_COLORS.reports },
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
      <h3
        className="text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
      >
        Volume &amp; {primaryLabel} Over Time
      </h3>
      <div className="-ml-2 md:ml-0">
        <ChartContainer config={chartConfig} className="h-[260px] md:h-[320px] w-full aspect-auto">
          <AreaChart data={mergedData} margin={{ left: -10, right: 10 }}>
            <defs>
              <linearGradient id="capturesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.captures} stopOpacity={0.15} />
                <stop offset="95%" stopColor={CHART_COLORS.captures} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="violationsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.violations} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.violations} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              padding={{ left: 10, right: 28 }}
              tickMargin={10}
              interval="preserveStartEnd"
              className="fill-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={isMobile ? 30 : undefined}
              className="fill-muted-foreground"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label: unknown) =>
                    useWeeks ? `Week of ${String(label)}` : String(label)
                  }
                  labelClassName="text-foreground"
                />
              }
            />
            <Legend content={<ChartLegendContent payload={undefined} />} />
            <Area
              type="monotone"
              dataKey="captures"
              stroke={CHART_COLORS.captures}
              strokeWidth={1.5}
              fill="url(#capturesGrad)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="primary"
              stroke={CHART_COLORS.violations}
              strokeWidth={2}
              fill="url(#violationsGrad)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="reports"
              stroke={CHART_COLORS.reports}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
},
(prev, next) =>
  prev.violationsBuckets === next.violationsBuckets &&
  prev.capturesBuckets === next.capturesBuckets &&
  prev.reportsBuckets === next.reportsBuckets &&
  prev.days === next.days &&
  prev.periodStart === next.periodStart &&
  prev.periodEnd === next.periodEnd &&
  prev.showingPermittedOnly === next.showingPermittedOnly,
);

// ──────────────────────────── Violation Mix (Horizontal Bar) ────────────────────────────

export const ViolationMixChart = memo(function ViolationMixChart({
  violations,
}: {
  violations: Array<{ code: string; count: number; percentage: number }>;
}) {
  if (violations.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 md:p-5 shadow-sm">
        <h3 className="text-base md:text-lg font-semibold text-foreground mb-3"
          style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
          Violation Breakdown
        </h3>
        <div className="py-8 md:py-12 text-center text-xs md:text-sm text-muted-foreground">
          No violations yet
        </div>
      </div>
    );
  }

  const chartData = violations.map((v, idx) => ({
    code: v.code,
    count: v.count,
    percentage: v.percentage,
    fill: PIE_COLORS[idx % PIE_COLORS.length],
  }));

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-5 shadow-sm">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-3"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
        Violation Breakdown
      </h3>
      <div className="space-y-2">
        {chartData.map((v) => {
          const policy = VIOLATION_POLICIES.find((p) => p.code === v.code);
          return (
            <HoverCard key={v.code} openDelay={200}>
              <HoverCardTrigger asChild>
                <div className="group cursor-help">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono text-foreground">
                      {v.code}
                      {policy && (
                        <span className="text-muted-foreground font-sans ml-1.5 hidden sm:inline">
                          {policy.title}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {v.count} ({v.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all group-hover:opacity-80"
                      style={{
                        width: `${v.percentage}%`,
                        backgroundColor: v.fill,
                        minWidth: "4px",
                      }}
                    />
                  </div>
                </div>
              </HoverCardTrigger>
              {policy && (
                <HoverCardContent className="w-96 bg-card border-border text-card-foreground" side="top">
                  <div className="space-y-2">
                    <div>
                      <div className="font-mono text-xs text-card-foreground/60">{policy.code}</div>
                      <div className="font-semibold text-sm text-card-foreground">{policy.title}</div>
                    </div>
                    <p className="text-xs text-card-foreground leading-relaxed">{policy.policy}</p>
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
      </div>
    </div>
  );
},
(prev, next) => prev.violations === next.violations,
);

// ──────────────────────────── Violation Trends ────────────────────────────

export const ViolationTrendsChart = memo(function ViolationTrendsChart({
  data,
  days,
}: {
  data: AdvancedStatsData["violations_by_code_by_bucket"];
  days: number;
  periodStart?: string;
  periodEnd?: string;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const useWeeks = days > 45;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 md:p-5 shadow-sm">
        <h3 className="text-base md:text-lg font-semibold text-foreground mb-3"
          style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
          Violation Trends
        </h3>
        <div className="py-8 text-center text-xs text-muted-foreground">No data</div>
      </div>
    );
  }

  const codes = Array.from(new Set(data.map((d) => d.code))).sort();
  const buckets = Array.from(new Set(data.map((d) => d.bucket))).sort();

  const merged = buckets.map((bucket) => {
    const row: Record<string, string | number> = {
      date: bucket.replace(/^\d{4}-/, ""),
    };
    codes.forEach((code) => {
      const entry = data.find((d) => d.bucket === bucket && d.code === code);
      row[code] = entry?.count || 0;
    });
    return row;
  });

  const chartConfig = Object.fromEntries(
    codes.map((code, i) => [
      code,
      { label: code, color: PIE_COLORS[i % PIE_COLORS.length] },
    ])
  );

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-5 shadow-sm">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-3"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
        Violation Trends
      </h3>
      <div className="-ml-2 md:ml-0">
        <ChartContainer config={chartConfig} className="h-[220px] md:h-[280px] w-full aspect-auto">
          <AreaChart data={merged} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              className="fill-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={isMobile ? 25 : 35}
              className="fill-muted-foreground"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label: unknown) =>
                    useWeeks ? `Week of ${String(label)}` : String(label)
                  }
                  labelClassName="text-foreground"
                />
              }
            />
            <Legend content={<ChartLegendContent payload={undefined} />} />
            {codes.map((code, i) => (
              <Area
                key={code}
                type="monotone"
                dataKey={code}
                stackId="1"
                stroke={PIE_COLORS[i % PIE_COLORS.length]}
                fill={PIE_COLORS[i % PIE_COLORS.length]}
                fillOpacity={0.3}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
},
(prev, next) => prev.data === next.data && prev.days === next.days,
);

// ──────────────────────────── Channel Trends ────────────────────────────

export const ChannelTrendsChart = memo(function ChannelTrendsChart({
  data,
  days,
}: {
  data: AdvancedStatsData["message_type_by_bucket"];
  days: number;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const useWeeks = days > 45;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    date: d.bucket.replace(/^\d{4}-/, ""),
    SMS: d.sms,
    Email: d.email,
    Other: d.unknown,
  }));

  const chartConfig = {
    SMS: { label: "SMS", color: CHART_COLORS.sms },
    Email: { label: "Email", color: CHART_COLORS.email },
    Other: { label: "Other", color: CHART_COLORS.unknown },
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-5 shadow-sm">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-3"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
        Channel Breakdown Over Time
      </h3>
      <div className="-ml-2 md:ml-0">
        <ChartContainer config={chartConfig} className="h-[220px] md:h-[280px] w-full aspect-auto">
          <AreaChart data={chartData} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
              interval="preserveStartEnd" className="fill-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
              width={isMobile ? 25 : 35} className="fill-muted-foreground"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label: unknown) =>
                    useWeeks ? `Week of ${String(label)}` : String(label)
                  }
                  labelClassName="text-foreground"
                />
              }
            />
            <Legend content={<ChartLegendContent payload={undefined} />} />
            <Area type="monotone" dataKey="SMS" stackId="1" stroke={CHART_COLORS.sms} fill={CHART_COLORS.sms} fillOpacity={0.3} strokeWidth={1.5} />
            <Area type="monotone" dataKey="Email" stackId="1" stroke={CHART_COLORS.email} fill={CHART_COLORS.email} fillOpacity={0.3} strokeWidth={1.5} />
            <Area type="monotone" dataKey="Other" stackId="1" stroke={CHART_COLORS.unknown} fill={CHART_COLORS.unknown} fillOpacity={0.3} strokeWidth={1.5} />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
},
(prev, next) => prev.data === next.data && prev.days === next.days,
);

// ──────────────────────────── Source Trends ────────────────────────────

export const SourceTrendsChart = memo(function SourceTrendsChart({
  data,
  days,
}: {
  data: AdvancedStatsData["source_by_bucket"];
  days: number;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const useWeeks = days > 45;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    date: d.bucket.replace(/^\d{4}-/, ""),
    "User Submitted": d.user_upload,
    "Bot Captured": d.honeytrap,
  }));

  const chartConfig = {
    "User Submitted": { label: "User Submitted", color: CHART_COLORS.userUpload },
    "Bot Captured": { label: "Bot Captured", color: CHART_COLORS.honeytrap },
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-5 shadow-sm">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-3"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}>
        Source Breakdown Over Time
      </h3>
      <div className="-ml-2 md:ml-0">
        <ChartContainer config={chartConfig} className="h-[220px] md:h-[280px] w-full aspect-auto">
          <AreaChart data={chartData} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
              interval="preserveStartEnd" className="fill-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
              width={isMobile ? 25 : 35} className="fill-muted-foreground"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label: unknown) =>
                    useWeeks ? `Week of ${String(label)}` : String(label)
                  }
                  labelClassName="text-foreground"
                />
              }
            />
            <Legend content={<ChartLegendContent payload={undefined} />} />
            <Area type="monotone" dataKey="User Submitted" stackId="1" stroke={CHART_COLORS.userUpload} fill={CHART_COLORS.userUpload} fillOpacity={0.3} strokeWidth={1.5} />
            <Area type="monotone" dataKey="Bot Captured" stackId="1" stroke={CHART_COLORS.honeytrap} fill={CHART_COLORS.honeytrap} fillOpacity={0.3} strokeWidth={1.5} />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
},
(prev, next) => prev.data === next.data && prev.days === next.days,
);

// ──────────────────────────── Domain Intelligence ────────────────────────────

export function DomainChart({
  domains,
  actblueUrls,
}: {
  domains: AdvancedStatsData["top_domains"];
  actblueUrls: AdvancedStatsData["top_actblue_urls"];
}) {
  if ((!domains || domains.length === 0) && (!actblueUrls || actblueUrls.length === 0)) {
    return null;
  }

  const maxDomainCount = domains.length > 0 ? domains[0].count : 1;

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
      <h3
        className="text-base md:text-lg font-semibold text-foreground mb-4"
        style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
      >
        Link Intelligence
      </h3>

      {domains.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            Top Domains in Flagged Messages
          </h4>
          <div className="space-y-1.5">
            {domains.slice(0, 10).map((d) => (
              <div key={d.domain} className="group">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="font-mono text-foreground truncate max-w-[70%]">
                    {d.domain}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{d.count}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${(d.count / maxDomainCount) * 100}%`, minWidth: "4px" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {actblueUrls.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            Top ActBlue Pages in Flagged Messages
          </h4>
          <div className="space-y-2">
            {actblueUrls.slice(0, 8).map((u) => (
              <div key={u.url} className="flex items-center justify-between text-xs gap-3">
                <span className="font-mono text-foreground truncate flex-1">{u.url}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">{u.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Sender Concentration ────────────────────────────

export function SenderConcentrationChart({
  senders,
}: {
  senders: AdvancedStatsData["sender_stats"];
}) {
  if (!senders || senders.length < 2) return null;

  const totalViolations = senders.reduce((sum, s) => sum + s.captures_with_violations, 0);
  if (totalViolations === 0) return null;

  const sorted = [...senders]
    .sort((a, b) => b.captures_with_violations - a.captures_with_violations)
    .slice(0, 10);

  let cumulative = 0;
  const chartData = sorted.map((s) => {
    cumulative += s.captures_with_violations;
    return {
      sender: s.sender.length > 20 ? s.sender.slice(0, 18) + "..." : s.sender,
      violations: s.captures_with_violations,
      cumulativePct: Math.round((cumulative / totalViolations) * 100),
    };
  });

  const top5Pct = sorted.length >= 5
    ? Math.round(
        (sorted.slice(0, 5).reduce((s, x) => s + x.captures_with_violations, 0) / totalViolations) * 100
      )
    : null;

  return (
    <div className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <h3
          className="text-base md:text-lg font-semibold text-foreground"
          style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
        >
          Sender Concentration
        </h3>
        {top5Pct !== null && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
            Top 5 = {top5Pct}% of violations
          </span>
        )}
      </div>
      <div className="-ml-2 md:ml-0">
        <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 32 + 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
            <YAxis
              type="category"
              dataKey="sender"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={180}
              className="fill-muted-foreground"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
                    <div className="font-semibold text-foreground">{d.sender}</div>
                    <div className="text-foreground">Violations: <span className="font-mono">{d.violations}</span></div>
                    <div className="text-foreground">Cumulative: <span className="font-mono">{d.cumulativePct}%</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="violations" fill={CHART_COLORS.violations} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
