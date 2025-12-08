"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, UserSearch } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

type SenderSearchComboboxProps = {
  selectedSenders: string[];
  pageSize: number;
  codes: string[];
  sources: string[];
};

export function SenderSearchCombobox({ selectedSenders, pageSize, codes, sources }: SenderSearchComboboxProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [senders, setSenders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedSenders));
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Fetch matching senders
  const fetchSenders = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSenders([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/cases?q=${encodeURIComponent(query)}&limit=20&include=`);
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        // Extract unique sender names
        const uniqueSenders = new Set<string>();
        items.forEach((item: { senderName?: string | null; senderId?: string | null }) => {
          const name = item.senderName || item.senderId;
          if (name && typeof name === 'string') {
            uniqueSenders.add(name);
          }
        });
        setSenders(Array.from(uniqueSenders));
      }
    } catch (error) {
      console.error("Failed to fetch senders:", error);
      setSenders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchSenders(searchQuery);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchQuery, fetchSenders]);

  const toggleSender = (sender: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(sender)) {
      newSelected.delete(sender);
    } else {
      newSelected.add(sender);
    }
    setSelected(newSelected);
  };

  const removeSender = (sender: string) => {
    const newSelected = new Set(selected);
    newSelected.delete(sender);
    setSelected(newSelected);
    applySelection(newSelected);
  };

  const clearAll = () => {
    setSelected(new Set());
    applySelection(new Set());
  };

  const applySelection = (selection: Set<string> = selected) => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", String(pageSize));
    
    // Add codes filter if present
    codes.forEach((code) => {
      params.append("codes", code);
    });

    // Add sources filter if present
    sources.forEach((source) => {
      params.append("sources", source);
    });

    // Add selected senders
    if (selection.size > 0) {
      params.set("senders", Array.from(selection).join(","));
    }

    router.push(`/cases?${params.toString()}`);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.defaultPrevented) {
      e.preventDefault();
      applySelection();
    }
  };

  return (
    <div className="flex items-center gap-2 w-full md:w-auto">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-sm px-4 py-2.5 rounded-md border border-border bg-background text-foreground hover:bg-secondary/50 inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap transition-colors">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground hidden" />
            <span className="truncate text-foreground text-sm">
              Search senders
            </span>
            {selected.size > 0 && (
              <span className="rounded-full bg-primary text-primary-foreground text-xs px-2 py-0.5">
                {selected.size}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] md:w-[400px] p-0 bg-card border border-border shadow-lg" align="start">
          <Command
            shouldFilter={false}
            onKeyDown={handleKeyDown}
            className="bg-card"
            style={{ color: "#0f172a" }}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-card">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                placeholder="Type to search senders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 h-8 bg-transparent text-sm font-normal outline-none placeholder:text-muted-foreground text-foreground"
                style={{ color: "#0f172a", caretColor: "var(--primary)" }}
              />
            </div>
            <CommandList className="bg-card">
              {loading ? (
                <div className="py-6 text-center text-sm bg-card">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <span className="text-muted-foreground">Searching...</span>
                </div>
              ) : searchQuery.trim() === "" ? (
                <div className="py-6 text-center text-sm text-muted-foreground bg-card">
                  Type to search for senders
                </div>
              ) : senders.length === 0 ? (
                <CommandEmpty className="bg-card">
                  <Empty className="py-4 bg-card">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <UserSearch className="h-8 w-8 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle className="text-base text-foreground">No senders found</EmptyTitle>
                      <EmptyDescription className="text-xs text-muted-foreground">
                        Try a different search term
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CommandEmpty>
              ) : (
                <CommandGroup className="bg-card">
                  {senders.map((sender) => (
                    <CommandItem
                      key={sender}
                      value={sender}
                      onSelect={() => toggleSender(sender)}
                      className="cursor-pointer hover:bg-secondary/50 aria-selected:bg-secondary/50 text-foreground"
                      style={{ color: "#0f172a" }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="checkbox"
                          checked={selected.has(sender)}
                          onChange={() => {}}
                          className="accent-primary cursor-pointer"
                        />
                        <span className="flex-1 truncate text-foreground" style={{ color: "#0f172a" }}>{sender}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            {(selected.size > 0 || senders.length > 0) && (
              <div className="border-t border-border p-2 flex items-center justify-between gap-2 bg-card">
                {selected.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="text-xs h-7 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  >
                    Clear all
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => applySelection()}
                  className="ml-auto text-xs h-7 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Apply {selected.size > 0 && `(${selected.size})`}
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {/* Display selected senders as badges */}
      {selected.size > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {Array.from(selected).slice(0, 2).map((sender) => (
            <Badge
              key={sender}
              variant="secondary"
              className="max-w-[150px] pl-2 pr-1 py-1 gap-1 bg-secondary text-secondary-foreground border border-border"
            >
              <span className="truncate text-xs">{sender}</span>
              <button
                onClick={() => removeSender(sender)}
                className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-secondary/80"
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Remove {sender}</span>
              </button>
            </Badge>
          ))}
          {selected.size > 2 && (
            <Badge variant="secondary" className="text-xs bg-secondary text-secondary-foreground border border-border">
              +{selected.size - 2} more
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

