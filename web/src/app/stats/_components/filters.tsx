"use client";

import { useState, useEffect, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  type RangeOption,
  type ViolationFilterOption,
  RANGE_LABELS,
  RANGE_ORDER,
  VIOLATION_FILTER_OPTIONS,
} from "../_lib/use-stats";

// ──────────────────────────── Shared checkbox list ────────────────────────────

function CheckboxList<T>({
  items,
  selected,
  onToggle,
  getKey,
  getLabel,
  isSelected,
  searchPlaceholder,
}: {
  items: T[];
  selected: T[];
  onToggle: (item: T) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  isSelected: (item: T) => boolean;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((item) =>
    getLabel(item).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {searchPlaceholder && (
        <div className="p-2 border-b border-border">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )}
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {filtered.map((item) => {
          const active = isSelected(item);
          return (
            <button
              key={getKey(item)}
              onClick={() => onToggle(item)}
              className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left transition-colors"
            >
              <div
                className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                  active ? "bg-primary border-primary" : "border-border"
                }`}
              >
                {active && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className="flex-1 text-popover-foreground text-left break-words text-sm">
                {getLabel(item)}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No results found
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="border-t border-border p-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{selected.length} selected</span>
          <button
            className="text-xs px-2 py-1 rounded-md border border-border text-foreground hover:bg-accent"
            onClick={() => selected.forEach((s) => onToggle(s))}
          >
            Clear all
          </button>
        </div>
      )}
    </>
  );
}

// ──────────────────────────── Filter trigger button ────────────────────────────

function FilterButton({
  label,
  count,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md border border-border bg-popover text-popover-foreground hover:bg-accent min-w-[120px] md:min-w-[150px] shrink-0">
          {count === 0 ? (
            label
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
                {count}
              </span>
              <span>selected</span>
            </span>
          )}
          <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-50 w-[min(92vw,380px)] max-w-[92vw] p-0 bg-popover border border-border shadow-xl rounded-xl"
        align="start"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

// ──────────────────────────── Main component ────────────────────────────

export function StatsFilters({
  range,
  setRange,
  selectedViolations,
  setSelectedViolations,
  selectedSenders,
  setSelectedSenders,
  selectedSource,
  setSelectedSource,
  selectedTypes,
  setSelectedTypes,
  allSenders,
  activeFilterCount,
  clearAll,
}: {
  range: RangeOption;
  setRange: (r: RangeOption) => void;
  selectedViolations: ViolationFilterOption[];
  setSelectedViolations: React.Dispatch<React.SetStateAction<ViolationFilterOption[]>>;
  selectedSenders: string[];
  setSelectedSenders: React.Dispatch<React.SetStateAction<string[]>>;
  selectedSource: string[];
  setSelectedSource: React.Dispatch<React.SetStateAction<string[]>>;
  selectedTypes: string[];
  setSelectedTypes: React.Dispatch<React.SetStateAction<string[]>>;
  allSenders: string[];
  activeFilterCount: number;
  clearAll: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedMobileSection, setExpandedMobileSection] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Detect when the filter section scrolls out of view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-64px 0px 0px 0px" }, // 64px = header height (h-16)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mobileOpen) {
      const w = window.innerWidth - document.documentElement.clientWidth;
      if (w > 0) document.body.style.paddingRight = `${w}px`;
    } else {
      document.body.style.paddingRight = "";
    }
    return () => { document.body.style.paddingRight = ""; };
  }, [mobileOpen]);

  const toggleViolation = (v: ViolationFilterOption) => {
    setSelectedViolations((prev) => {
      const exists = prev.some((sv) => sv.code === v.code && sv.isPermitted === v.isPermitted);
      return exists
        ? prev.filter((sv) => !(sv.code === v.code && sv.isPermitted === v.isPermitted))
        : [...prev, v];
    });
  };

  const toggleSender = (s: string) => {
    setSelectedSenders((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleSource = (s: string) => {
    setSelectedSource((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleType = (t: string) => {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  return (
    <>
      {/* Sticky filter bar -- appears pinned below the header when the main filters scroll out of view */}
      <div
        className={`fixed top-16 left-0 right-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-sm transition-all duration-200 ${
          isStuck ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="container mx-auto px-6 md:px-12 max-w-6xl py-2.5">
          {/* Desktop: right-aligned inline filters matching the page layout */}
          <div className="hidden md:flex flex-wrap gap-2 items-center justify-end">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 hover:bg-accent rounded transition-colors mr-1"
              >
                {showAdvanced ? "Fewer Filters" : "More Filters"}
              </button>
            <div className="flex flex-wrap gap-2 items-center justify-end">
              <FilterButton label={RANGE_LABELS[range]} count={0}>
                <div className="p-1">
                  {RANGE_ORDER.map((opt) => (
                    <button
                      key={`sticky-range-${opt}`}
                      onClick={() => setRange(opt)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent ${
                        range === opt ? "bg-primary text-primary-foreground hover:bg-primary" : "text-popover-foreground"
                      }`}
                    >
                      {RANGE_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </FilterButton>
              <FilterButton label="Violations" count={selectedViolations.length}>
                <CheckboxList
                  items={VIOLATION_FILTER_OPTIONS}
                  selected={selectedViolations}
                  onToggle={toggleViolation}
                  getKey={(v) => `sticky-${v.code}-${v.isPermitted ?? "none"}`}
                  getLabel={(v) => v.label}
                  isSelected={(v) =>
                    selectedViolations.some((sv) => sv.code === v.code && sv.isPermitted === v.isPermitted)
                  }
                  searchPlaceholder="Search violations..."
                />
              </FilterButton>
              <FilterButton label="Senders" count={selectedSenders.length}>
                <CheckboxList
                  items={allSenders}
                  selected={selectedSenders}
                  onToggle={toggleSender}
                  getKey={(s) => `sticky-${s}`}
                  getLabel={(s) => s}
                  isSelected={(s) => selectedSenders.includes(s)}
                  searchPlaceholder="Search senders..."
                />
              </FilterButton>

              {showAdvanced && (
                <FilterButton label="Source" count={selectedSource.length}>
                  <div className="p-2">
                    {[
                      { value: "user_upload", label: "User Submitted" },
                      { value: "honeytrap", label: "Bot Captured" },
                    ].map(({ value, label }) => (
                      <button
                        key={`sticky-src-${value}`}
                        onClick={() => toggleSource(value)}
                        className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left transition-colors"
                      >
                        <div className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                          selectedSource.includes(value) ? "bg-primary border-primary" : "border-border"
                        }`}>
                          {selectedSource.includes(value) && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span className="text-popover-foreground">{label}</span>
                      </button>
                    ))}
                  </div>
                </FilterButton>
              )}

              {showAdvanced && (
                <FilterButton label="Type" count={selectedTypes.length}>
                  <div className="p-2">
                    {[
                      { value: "sms", label: "SMS" },
                      { value: "email", label: "Email" },
                      { value: "unknown", label: "Other" },
                    ].map(({ value, label }) => (
                      <button
                        key={`sticky-type-${value}`}
                        onClick={() => toggleType(value)}
                        className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left transition-colors"
                      >
                        <div className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                          selectedTypes.includes(value) ? "bg-primary border-primary" : "border-border"
                        }`}>
                          {selectedTypes.includes(value) && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span className="text-popover-foreground">{label}</span>
                      </button>
                    ))}
                  </div>
                </FilterButton>
              )}

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Mobile: compact sticky trigger */}
          <div className="md:hidden flex items-center gap-2 w-full">
            <span className="text-sm font-medium text-foreground truncate">{RANGE_LABELS[range]}</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5 shrink-0">
                {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={() => setMobileOpen(true)}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* Sentinel: intersection observer watches this to know when to show sticky bar */}
      <div ref={sentinelRef} />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2
          className="text-2xl md:text-3xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
        >
          Filter &amp; Analyze
        </h2>

        {/* Mobile trigger */}
        <div className="md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md border border-border bg-card text-foreground hover:bg-accent w-full transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Desktop filters */}
        <div className="hidden md:flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 items-center justify-end md:justify-start ml-auto md:ml-0">
            {/* Range */}
            <FilterButton label={RANGE_LABELS[range]} count={0}>
              <div className="p-1">
                {RANGE_ORDER.map((opt) => (
                  <button
                    key={`range-${opt}`}
                    onClick={() => setRange(opt)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent ${
                      range === opt ? "bg-primary text-primary-foreground hover:bg-primary" : "text-popover-foreground"
                    }`}
                  >
                    {RANGE_LABELS[opt]}
                  </button>
                ))}
              </div>
            </FilterButton>

            {/* Violations */}
            <FilterButton label="Violations" count={selectedViolations.length}>
              <CheckboxList
                items={VIOLATION_FILTER_OPTIONS}
                selected={selectedViolations}
                onToggle={toggleViolation}
                getKey={(v) => `${v.code}-${v.isPermitted ?? "none"}`}
                getLabel={(v) => v.label}
                isSelected={(v) =>
                  selectedViolations.some((sv) => sv.code === v.code && sv.isPermitted === v.isPermitted)
                }
                searchPlaceholder="Search violations..."
              />
            </FilterButton>

            {/* Senders */}
            <FilterButton label="Senders" count={selectedSenders.length}>
              <CheckboxList
                items={allSenders}
                selected={selectedSenders}
                onToggle={toggleSender}
                getKey={(s) => s}
                getLabel={(s) => s}
                isSelected={(s) => selectedSenders.includes(s)}
                searchPlaceholder="Search senders..."
              />
            </FilterButton>

            {/* Advanced: Source */}
            {showAdvanced && (
              <FilterButton label="Source" count={selectedSource.length}>
                <div className="p-2">
                  {[
                    { value: "user_upload", label: "User Submitted" },
                    { value: "honeytrap", label: "Bot Captured" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleSource(value)}
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left transition-colors"
                    >
                      <div className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                        selectedSource.includes(value) ? "bg-primary border-primary" : "border-border"
                      }`}>
                        {selectedSource.includes(value) && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="text-popover-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </FilterButton>
            )}

            {/* Advanced: Type */}
            {showAdvanced && (
              <FilterButton label="Type" count={selectedTypes.length}>
                <div className="p-2">
                  {[
                    { value: "sms", label: "SMS" },
                    { value: "email", label: "Email" },
                    { value: "unknown", label: "Other" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleType(value)}
                      className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left transition-colors"
                    >
                      <div className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                        selectedTypes.includes(value) ? "bg-primary border-primary" : "border-border"
                      }`}>
                        {selectedTypes.includes(value) && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="text-popover-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </FilterButton>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 hover:bg-accent rounded transition-colors"
            >
              {showAdvanced ? "Fewer Filters" : "More Filters"}
            </button>
          </div>
        </div>
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Active filters:</span>
          {selectedViolations.map((v, idx) => (
            <FilterBadge
              key={`v-${v.code}-${v.isPermitted ?? "none"}-${idx}`}
              label={v.isPermitted === true ? `${v.code} (Permitted)` : v.isPermitted === false ? `${v.code} (Unverified)` : v.code}
              onRemove={() => toggleViolation(v)}
            />
          ))}
          {selectedSenders.map((s) => (
            <FilterBadge key={`s-${s}`} label={s} onRemove={() => toggleSender(s)} />
          ))}
          {selectedSource.map((s) => (
            <FilterBadge key={`src-${s}`} label={s === "user_upload" ? "User Submitted" : "Bot Captured"} onRemove={() => toggleSource(s)} />
          ))}
          {selectedTypes.map((t) => (
            <FilterBadge key={`t-${t}`} label={t === "sms" ? "SMS" : t === "email" ? "Email" : "Other"} onRemove={() => toggleType(t)} />
          ))}
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground underline ml-2 transition-colors">
            Clear all
          </button>
        </div>
      )}

      {/* Mobile dialog */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="w-full sm:max-w-lg p-0 max-h-[90vh] overflow-hidden flex flex-col"
          style={{ width: "calc(100vw - 3rem)", maxWidth: "460px" }}
        >
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription className="text-xs">Select filters to refine statistics.</DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6 space-y-1 overflow-y-auto flex-1">
            <MobileSection
              title="Time Range"
              suffix={RANGE_LABELS[range]}
              expanded={expandedMobileSection === "range"}
              onToggle={() => setExpandedMobileSection(expandedMobileSection === "range" ? null : "range")}
            >
              <div className="grid grid-cols-2 gap-2">
                {RANGE_ORDER.map((opt) => (
                  <button
                    key={`m-range-${opt}`}
                    onClick={() => setRange(opt)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      range === opt ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    {RANGE_LABELS[opt]}
                  </button>
                ))}
              </div>
            </MobileSection>

            <MobileSection
              title="Violations"
              suffix={selectedViolations.length > 0 ? `(${selectedViolations.length})` : undefined}
              expanded={expandedMobileSection === "violations"}
              onToggle={() => setExpandedMobileSection(expandedMobileSection === "violations" ? null : "violations")}
            >
              <CheckboxList
                items={VIOLATION_FILTER_OPTIONS}
                selected={selectedViolations}
                onToggle={toggleViolation}
                getKey={(v) => `m-${v.code}-${v.isPermitted ?? "none"}`}
                getLabel={(v) => v.label}
                isSelected={(v) =>
                  selectedViolations.some((sv) => sv.code === v.code && sv.isPermitted === v.isPermitted)
                }
                searchPlaceholder="Search violations..."
              />
            </MobileSection>

            <MobileSection
              title="Senders"
              suffix={selectedSenders.length > 0 ? `(${selectedSenders.length})` : undefined}
              expanded={expandedMobileSection === "senders"}
              onToggle={() => setExpandedMobileSection(expandedMobileSection === "senders" ? null : "senders")}
            >
              <CheckboxList
                items={allSenders}
                selected={selectedSenders}
                onToggle={toggleSender}
                getKey={(s) => `m-${s}`}
                getLabel={(s) => s}
                isSelected={(s) => selectedSenders.includes(s)}
                searchPlaceholder="Search senders..."
              />
            </MobileSection>

            <MobileSection
              title="Source"
              suffix={selectedSource.length > 0 ? `(${selectedSource.length})` : undefined}
              expanded={expandedMobileSection === "source"}
              onToggle={() => setExpandedMobileSection(expandedMobileSection === "source" ? null : "source")}
            >
              {["user_upload", "honeytrap"].map((s) => (
                <button
                  key={`m-src-${s}`}
                  onClick={() => toggleSource(s)}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left transition-colors"
                >
                  <div className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                    selectedSource.includes(s) ? "bg-primary border-primary" : "border-border"
                  }`}>
                    {selectedSource.includes(s) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span className="text-popover-foreground">{s === "user_upload" ? "User Submitted" : "Bot Captured"}</span>
                </button>
              ))}
            </MobileSection>

            <MobileSection
              title="Type"
              suffix={selectedTypes.length > 0 ? `(${selectedTypes.length})` : undefined}
              expanded={expandedMobileSection === "type"}
              onToggle={() => setExpandedMobileSection(expandedMobileSection === "type" ? null : "type")}
            >
              {[
                { value: "sms", label: "SMS" },
                { value: "email", label: "Email" },
                { value: "unknown", label: "Other" },
              ].map(({ value, label }) => (
                <button
                  key={`m-type-${value}`}
                  onClick={() => toggleType(value)}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left transition-colors"
                >
                  <div className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${
                    selectedTypes.includes(value) ? "bg-primary border-primary" : "border-border"
                  }`}>
                    {selectedTypes.includes(value) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span className="text-popover-foreground">{label}</span>
                </button>
              ))}
            </MobileSection>

            <div className="flex gap-2 pt-4">
              <button onClick={clearAll} className="flex-1 px-4 py-2.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors">
                Clear All
              </button>
              <button onClick={() => setMobileOpen(false)} className="flex-1 px-4 py-2.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Apply
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ──────────────────────────── Sub-components ────────────────────────────

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
      title="Click to remove filter"
    >
      <span className="truncate max-w-[200px]">{label}</span>
      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

function MobileSection({
  title,
  suffix,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  suffix?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border pb-1">
      <button onClick={onToggle} className="w-full flex items-center justify-between py-3 text-left">
        <span className="text-sm font-medium text-foreground">
          {title} {suffix && <span className="text-muted-foreground">{suffix}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <div className="pb-3">{children}</div>}
    </div>
  );
}
