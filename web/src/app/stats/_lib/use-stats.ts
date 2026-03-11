"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VIOLATION_POLICIES } from "@/lib/violation-policies";

// ──────────────────────────── Types ────────────────────────────

export type RangeOption = "7" | "30" | "90" | "lifetime";

export type ViolationFilterOption = {
  code: string;
  label: string;
  isPermitted?: boolean;
};

export type StatsData = {
  period: { start: string; end: string; days: number };
  kpis: {
    total_captures: number;
    captures_with_violations: number;
    total_reports: number;
    user_uploads: number;
    honeytraps: number;
  };
  captures_by_bucket: Array<{ bucket: string; count: number }> | null;
  violations_by_bucket: Array<{ bucket: string; count: number }> | null;
  reports_by_bucket: Array<{ bucket: string; count: number }> | null;
  top_senders: Array<{
    sender: string;
    total_captures: number;
    captures_with_violations: number;
    is_repeat_offender: boolean;
  }> | null;
  violation_mix: Array<{ code: string; count: number; percentage: number }> | null;
  source_split: Array<{ source: string; count: number; percentage: number }>;
};

export type AdvancedStatsData = {
  sender_stats: Array<{
    sender: string;
    total_captures: number;
    captures_with_violations: number;
    violation_rate: number;
    top_violation_code: string | null;
    first_seen: string;
    last_seen: string;
    is_repeat_offender: boolean;
  }>;
  top_domains: Array<{ domain: string; count: number }>;
  top_actblue_urls: Array<{ url: string; count: number }>;
  message_type_by_bucket: Array<{
    bucket: string;
    sms: number;
    email: number;
    unknown: number;
  }>;
  source_by_bucket: Array<{
    bucket: string;
    user_upload: number;
    honeytrap: number;
  }>;
  violations_by_code_by_bucket: Array<{
    bucket: string;
    code: string;
    count: number;
  }>;
};

export type DataRequestField = "reviewed_messages" | "detected_violations" | "email_html" | "non_fundraising" | "verdicts";

// ──────────────────────────── Constants ────────────────────────────

export const RANGE_LABELS: Record<RangeOption, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  lifetime: "Lifetime",
};

export const RANGE_ORDER: RangeOption[] = ["7", "30", "90", "lifetime"];

export const CHART_COLORS = {
  captures: "hsl(142, 76%, 36%)",
  violations: "hsl(224, 76%, 48%)",
  reports: "hsl(213, 94%, 68%)",
  userUpload: "hsl(213, 94%, 68%)",
  honeytrap: "hsl(226, 71%, 40%)",
  sms: "hsl(142, 76%, 36%)",
  email: "hsl(224, 76%, 48%)",
  unknown: "hsl(213, 94%, 68%)",
  funnelCaptures: "hsl(215, 20%, 65%)",
  funnelViolations: "hsl(224, 76%, 48%)",
  funnelReports: "hsl(142, 76%, 36%)",
};

export const PIE_COLORS = [
  "hsl(213, 94%, 68%)",
  "hsl(217, 91%, 60%)",
  "hsl(224, 76%, 48%)",
  "hsl(226, 71%, 40%)",
  "hsl(224, 64%, 33%)",
  "hsl(222, 47%, 11%)",
  "hsl(206, 92%, 54%)",
  "hsl(215, 28%, 17%)",
];

export const DATA_REQUEST_FIELD_OPTIONS = [
  { value: "reviewed_messages" as const, label: "Reviewed Messages" },
  { value: "detected_violations" as const, label: "Detected Violations" },
  { value: "email_html" as const, label: "Email HTML" },
  { value: "non_fundraising" as const, label: "Non-Fundraising" },
  { value: "verdicts" as const, label: "Verdicts" },
];

export const VIOLATION_FILTER_OPTIONS: ViolationFilterOption[] =
  VIOLATION_POLICIES.flatMap((policy) => {
    if (policy.code === "AB008") {
      return [
        { code: "AB008", label: `${policy.code} - ${policy.title}`, isPermitted: false },
        { code: "AB008", label: `${policy.code} - Documented Matching Program`, isPermitted: true },
      ];
    }
    return [{ code: policy.code, label: `${policy.code} - ${policy.title}` }];
  });

// ──────────────────────────── Helpers ────────────────────────────

function buildQueryString(
  range: RangeOption,
  selectedSenders: string[],
  selectedViolations: ViolationFilterOption[],
  selectedSource: string[],
  selectedTypes: string[],
): string {
  const qs = new URLSearchParams({ range });
  selectedSenders.forEach((s) => qs.append("sender", s));
  selectedViolations.forEach((v) => {
    if (v.isPermitted === true) {
      qs.append("violation", `${v.code}:permitted`);
    } else if (v.isPermitted === false) {
      qs.append("violation", `${v.code}:unverified`);
    } else {
      qs.append("violation", v.code);
    }
  });
  selectedSource.forEach((s) => qs.append("source", s));
  selectedTypes.forEach((t) => qs.append("type", t));
  return qs.toString();
}

// ──────────────────────────── useFilters ────────────────────────────

export function useFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<RangeOption>(() => {
    const r = searchParams.get("range");
    return (r === "7" || r === "30" || r === "90" || r === "lifetime") ? r : "30";
  });

  const [selectedSenders, setSelectedSenders] = useState<string[]>(() => {
    return searchParams.getAll("sender").filter(Boolean);
  });

  const [selectedViolations, setSelectedViolations] = useState<ViolationFilterOption[]>(() => {
    return searchParams.getAll("violation").map((v) => {
      if (v.includes(":")) {
        const [code, flag] = v.split(":");
        const opt = VIOLATION_FILTER_OPTIONS.find(
          (o) => o.code === code && o.isPermitted === (flag === "permitted")
        );
        return opt || { code, label: code, isPermitted: flag === "permitted" };
      }
      const opt = VIOLATION_FILTER_OPTIONS.find(
        (o) => o.code === v && o.isPermitted === undefined
      );
      return opt || { code: v, label: v };
    });
  });

  const [selectedSource, setSelectedSource] = useState<string[]>(() => {
    return searchParams.getAll("source").filter(Boolean);
  });

  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    return searchParams.getAll("type").filter(Boolean);
  });

  // Sync state changes back to URL
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const qs = new URLSearchParams();
    if (range !== "30") qs.set("range", range);
    selectedSenders.forEach((s) => qs.append("sender", s));
    selectedViolations.forEach((v) => {
      if (v.isPermitted === true) qs.append("violation", `${v.code}:permitted`);
      else if (v.isPermitted === false) qs.append("violation", `${v.code}:unverified`);
      else qs.append("violation", v.code);
    });
    selectedSource.forEach((s) => qs.append("source", s));
    selectedTypes.forEach((t) => qs.append("type", t));
    const str = qs.toString();
    router.replace(str ? `?${str}` : "/stats", { scroll: false });
  }, [range, selectedSenders, selectedViolations, selectedSource, selectedTypes, router]);

  const clearAll = useCallback(() => {
    setSelectedViolations([]);
    setSelectedSenders([]);
    setSelectedSource([]);
    setSelectedTypes([]);
  }, []);

  const activeFilterCount =
    selectedViolations.length +
    selectedSenders.length +
    selectedSource.length +
    selectedTypes.length;

  const showingPermittedOnly =
    selectedViolations.length === 1 &&
    selectedViolations[0].code === "AB008" &&
    selectedViolations[0].isPermitted === true;

  return {
    range, setRange,
    selectedSenders, setSelectedSenders,
    selectedViolations, setSelectedViolations,
    selectedSource, setSelectedSource,
    selectedTypes, setSelectedTypes,
    clearAll, activeFilterCount, showingPermittedOnly,
  };
}

// ──────────────────────────── useStats ────────────────────────────

export function useStats(filters: ReturnType<typeof useFilters>) {
  const { range, selectedSenders, selectedViolations, selectedSource, selectedTypes } = filters;

  const [data, setData] = useState<StatsData | null>(null);
  const [advancedData, setAdvancedData] = useState<AdvancedStatsData | null>(null);
  const [previousData, setPreviousData] = useState<StatsData | null>(null);
  const [allSenders, setAllSenders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch main stats + advanced stats in parallel
  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const qs = buildQueryString(range, selectedSenders, selectedViolations, selectedSource, selectedTypes);

        const [statsRes, advancedRes] = await Promise.all([
          fetch(`/api/stats?${qs}`),
          fetch(`/api/stats/advanced?${qs}`),
        ]);

        if (!statsRes.ok) throw new Error(`Stats: ${statsRes.status}`);
        const statsJson = await statsRes.json();

        let advancedJson: AdvancedStatsData | null = null;
        if (advancedRes.ok) {
          advancedJson = await advancedRes.json();
        }

        if (!cancelled) {
          setData(statsJson);
          setAdvancedData(advancedJson);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchStats();
    return () => { cancelled = true; };
  }, [range, selectedSenders, selectedViolations, selectedSource, selectedTypes]);

  // Previous period comparison requires custom date range support in the API.
  // For now, previousData remains null. To enable: extend /api/stats to accept
  // start_date/end_date params, then fetch the prior period here in parallel.
  useEffect(() => {
    setPreviousData(null);
  }, [range]);

  // Fetch sender options (unfiltered) for filter dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ range });
        const resp = await fetch(`/api/stats?${qs.toString()}`);
        if (!resp.ok) return;
        const json = (await resp.json()) as Partial<StatsData> | undefined;
        const opts = Array.from(
          new Set((json?.top_senders || []).map((s: { sender: string }) => String(s.sender)))
        ) as string[];
        if (!cancelled) setAllSenders(opts);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [range]);

  return { data, advancedData, previousData, allSenders, loading, error };
}

// ──────────────────────────── Bucket helpers ────────────────────────────

export function nyDateKey(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

export function startOfWeekNY(d: Date): Date {
  const ny = new Date(d);
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).formatToParts(ny).find((p) => p.type === "weekday")?.value || "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const w = map[dow] ?? 1;
  const daysFromMonday = (w + 6) % 7;
  const out = new Date(ny);
  out.setUTCDate(out.getUTCDate() - daysFromMonday);
  return out;
}

export function buildKeys(
  periodStart: string | undefined,
  periodEnd: string | undefined,
  days: number,
  fallbackBuckets: Array<{ bucket: string }>,
): string[] {
  const useWeeks = days > 45;
  try {
    if (!periodStart || !periodEnd) return fallbackBuckets.map((b) => nyDateKey(new Date(b.bucket)));
    const keys: string[] = [];
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (!useWeeks) {
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        keys.push(nyDateKey(d));
      }
    } else {
      for (let d = startOfWeekNY(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
        keys.push(nyDateKey(d));
      }
    }
    return keys;
  } catch {
    return fallbackBuckets.map((b) => nyDateKey(new Date(b.bucket)));
  }
}

export function normalizeKey(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return nyDateKey(new Date(v));
}
