"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { assertSupabaseBrowser } from "@/lib/supabase";
import { cachedJsonFetch } from "@/lib/client-cache";
import { Footer } from "@/components/Footer";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useOnboardingState } from "@/components/onboarding/useOnboardingState";
import { OnboardingToast } from "@/components/onboarding/OnboardingToast";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { isBotSubmitted } from "@/lib/badge-helpers";
import { Upload, Mail, Copy, Menu, ArrowRight, AlertTriangle, CheckCircle2, Shield } from "lucide-react";

function OnboardingHandler({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    if (searchParams?.get("onboarding") === "open") {
      onOpen();
    }
  }, [searchParams, onOpen]);

  return null;
}

function ScrollHandler({ scrollToSubmission }: { scrollToSubmission: () => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams?.get("scroll") === "submission") {
      // Use setTimeout to ensure ref is available
      setTimeout(() => {
        scrollToSubmission();
      }, 100);
    }
  }, [searchParams, scrollToSubmission]);

  return null;
}

export default function Home() {
  const [status, setStatus] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [mode, setMode] = useState<"screenshot" | "forward">("screenshot");
  const [forwardedCases, setForwardedCases] = useState<Array<{ id: string; status: 'processing' | 'complete'; senderName?: string | null }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const copiedTimeoutRef = useRef<number | null>(null);
  const submissionRef = useRef<HTMLDivElement>(null);

  // Onboarding state
  const { shouldShowToast, markDismissed, markClicked } = useOnboardingState();
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  const handleOnboardingOpen = useCallback(() => {
    setIsOnboardingOpen(true);
  }, []);

  const onBrowseClick = useCallback(() => inputRef.current?.click(), []);

  const scrollToSubmission = useCallback(() => {
    submissionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file || isUploading) return;
    setIsUploading(true);
    setStatus("");
    setStepIndex(0);
    try {
      const create = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "image/jpeg" }),
      });
      if (!create.ok) throw new Error("Failed to create submission");
      const { submissionId, bucket, objectPath } = (await create.json()) as {
        submissionId: string;
        bucket: string;
        objectPath: string;
      };

      const supabase = assertSupabaseBrowser();
      const uploadPromise = supabase.storage.from(bucket).upload(objectPath, file, {
        upsert: false,
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
      });
      const dataUrl = await readAsDataUrl(file);
      const ocrPromise = fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, dataUrl }),
      });

      const { error } = await uploadPromise;
      if (error) throw error;
      setStepIndex(1);

      const ocrResp = await ocrPromise;
      if (ocrResp.status === 409) {
        const j = (await ocrResp.json().catch(() => null)) as { url?: string; caseId?: string } | null;
        const url = j?.url || (j?.caseId ? `/cases/${j.caseId}` : null);
        setStatus("We already have this case. Opening the original...");
        if (url) {
          window.location.href = url;
          return;
        }
        throw new Error("Duplicate detected but no URL provided");
      }
      if (!ocrResp.ok) {
        const body = await ocrResp.text().catch(() => "");
        throw new Error(`/api/ocr failed ${ocrResp.status}: ${body}`);
      }
      
      const ocrData = (await ocrResp.json().catch(() => ({}))) as { 
        warning?: string; 
        totalPageCount?: number 
      };
      
      setStepIndex(2);
      
      if (ocrData.warning === "page_limit" && ocrData.totalPageCount) {
        window.location.href = `/cases/${submissionId}?warning=page_limit&pages=${ocrData.totalPageCount}`;
      } else {
        window.location.href = `/cases/${submissionId}`;
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      setStatus(`Processing failed: ${message}`);
      setIsUploading(false);
    }
  }, [isUploading]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  }, [handleFile]);

  const [isDragOver, setIsDragOver] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }, [handleFile]);

  const onCardPaste = useCallback((e: React.ClipboardEvent) => {
    if (isUploading) return;
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length > 0) {
      e.preventDefault();
      void handleFile(files[0]);
    }
  }, [handleFile, isUploading]);

  // Poll for forwarded email cases when in forward mode
  useEffect(() => {
    if (mode !== "forward") {
      setForwardedCases([]);
      return;
    }

    let cancelled = false;
    const pollInterval = setInterval(async () => {
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const supabase = assertSupabaseBrowser();
        const { data, error } = await supabase
          .from('submissions')
          .select('id, created_at, ai_version, sender_name')
          .gte('created_at', fiveMinutesAgo)
          .eq('message_type', 'email')
          .order('created_at', { ascending: false })
          .limit(5);

        if (error || cancelled) return;

        const cases = (data || []).map((c: { id: string; ai_version?: string | null; sender_name?: string | null }) => ({
          id: c.id,
          status: (c.ai_version ? 'complete' : 'processing') as 'processing' | 'complete',
          senderName: c.sender_name ?? null,
        }));

        if (!cancelled) {
          setForwardedCases(cases);
        }
      } catch (err) {
        console.error('Failed to poll for forwarded cases:', err);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [mode]);

  // Cleanup copy tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Handle ?onboarding=open query param */}
      <Suspense fallback={null}>
        <OnboardingHandler onOpen={handleOnboardingOpen} />
      </Suspense>

      {/* Handle ?scroll=submission query param */}
      <Suspense fallback={null}>
        <ScrollHandler scrollToSubmission={scrollToSubmission} />
      </Suspense>

      {/* Onboarding toast */}
      {shouldShowToast && (
        <OnboardingToast
          onClick={() => {
            markClicked();
            setIsOnboardingOpen(true);
          }}
          onDismiss={markDismissed}
        />
      )}

      {/* Onboarding modal */}
      <OnboardingModal
        open={isOnboardingOpen}
        onOpenChange={setIsOnboardingOpen}
      />

      <div data-theme="v2" className="min-h-screen flex flex-col font-sans bg-background selection:bg-primary/20 selection:text-primary">
        {/* Header */}
        <header className="border-b border-border/50 sticky top-0 header-frosted z-50">
          <div className="container mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.webp"
                alt="AB Jail logo"
                width={32}
                height={32}
                className="w-8 h-8 rounded-md"
              />
              <span className="font-semibold tracking-tight text-lg text-foreground">AB Jail</span>
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full bg-secondary text-[10px] uppercase tracking-wider font-medium text-secondary-foreground ml-0">
                Beta
              </span>
            </div>

            <NavigationMenu className="hidden md:flex" viewport={false}>
              <NavigationMenuList className="gap-1">
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-muted-foreground hover:text-foreground hover:bg-transparent data-[state=open]:bg-transparent">
                    Cases
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-48 gap-1 p-2">
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/cases"
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">All Messages</div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/cases?codes=ANY_VIOLATION"
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Detected Violations</div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/reports"
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Reports to ActBlue</div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href="/stats"
                      className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Statistics
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent text-muted-foreground hover:text-foreground hover:bg-transparent data-[state=open]:bg-transparent">
                    About
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-48 gap-1 p-2">
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/welcome"
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">How it Works</div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/stats"
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Stats and Data</div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/evaluation"
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">AI Training</div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <Link
                            href="/about"
                            className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          >
                            <div className="text-sm font-medium">Contact</div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>

            <div className="flex items-center gap-4">
              <button 
                onClick={scrollToSubmission}
                className="hidden md:inline-flex border border-primary text-primary bg-background/50 px-4 py-2 text-sm font-medium rounded-sm hover:bg-primary/5 transition-colors backdrop-blur-sm"
              >
                Submit Evidence
              </button>

              <Sheet>
                <SheetTrigger asChild>
                  <button className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors">
                    <Menu className="w-5 h-5" />
                    <span className="sr-only">Open menu</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="bg-background text-foreground">
                  <SheetHeader>
                    <SheetTitle className="text-left text-foreground">Menu</SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-col gap-6 mt-6 px-2">
                    <button 
                      onClick={() => {
                        scrollToSubmission();
                      }}
                      className="w-full border border-primary text-primary bg-background/50 px-4 py-3 text-sm font-medium rounded-sm hover:bg-primary/5 transition-colors"
                    >
                      Submit Evidence
                    </button>

                    <div className="space-y-3">
                      <h3 className="font-medium text-sm text-foreground">Cases</h3>
                      <ul className="space-y-2 pl-3">
                        <li>
                          <Link href="/cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            All Messages
                          </Link>
                        </li>
                        <li>
                          <Link href="/cases?codes=ANY_VIOLATION" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            Detected Violations
                          </Link>
                        </li>
                        <li>
                          <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            Reports to ActBlue
                          </Link>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <Link href="/stats" className="font-medium text-sm text-foreground hover:text-primary transition-colors">
                        Statistics
                      </Link>
                    </div>
                    <div className="space-y-3">
                      <h3 className="font-medium text-sm text-foreground">About</h3>
                      <ul className="space-y-2 pl-3">
                        <li>
                          <Link href="/welcome" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            How it Works
                          </Link>
                        </li>
                        <li>
                          <Link href="/stats" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            Stats and Data
                          </Link>
                        </li>
                        <li>
                          <Link href="/evaluation" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            AI Training
                          </Link>
                        </li>
                        <li>
                          <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            Contact
                          </Link>
                        </li>
                      </ul>
                    </div>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <main className="flex-1">
          {/* Hero Section */}
          <section className="pt-20 pb-16 border-b border-border/40 bg-secondary/20 md:pt-28 md:pb-24">
            <div className="container mx-auto px-6 md:px-12 max-w-6xl">
              <div className="text-center md:text-left leading-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border backdrop-blur-sm text-xs font-medium text-muted-foreground shadow-sm bg-background">
                  <Shield className="w-3 h-3 text-primary" />
                  <span>Open source. Independent. Pro-Donor.</span>
                </div>
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-medium tracking-tight text-foreground leading-[1.1]" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>
                  Deceptive fundraising <br className="hidden md:block" />
                  <span className="text-muted-foreground">belongs in the public record.</span>
                </h1>
                <p className="text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed font-light">
                  AB Jail is an open source initiative dedicated to tracking and exposing deceptive political fundraising practices. We are not affiliated with ActBlue.
                </p>

                {/* Submission Section */}
                <div className="pt-8 md:pt-12" ref={submissionRef}>
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-medium text-foreground mb-4">Choose your submission method</h3>
                    <div className="inline-flex rounded-full border border-border backdrop-blur-sm p-1 shadow-sm relative bg-background">
                      {/* Sliding indicator */}
                      <div
                        className={`absolute top-1 bottom-1 w-[calc(50%-2px)] bg-primary rounded-full transition-all duration-300 ease-out ${
                          mode === "forward" ? "left-[calc(50%+2px)]" : "left-1"
                        }`}
                      />
                      <button
                        onClick={() => setMode("screenshot")}
                        className={`px-6 py-2 rounded-full text-sm font-medium transition-colors duration-300 relative z-10 ${
                          mode === "screenshot"
                            ? "text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Screenshot
                      </button>
                      <button
                        onClick={() => setMode("forward")}
                        className={`px-6 py-2 rounded-full text-sm font-medium transition-colors duration-300 relative z-10 ${
                          mode === "forward"
                            ? "text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Forward
                      </button>
                    </div>
                  </div>

                  <div className="max-w-2xl mx-auto">
                    {!isUploading && mode === "screenshot" && (
                      <div 
                        className="bg-background/50 backdrop-blur-sm border border-border p-2 rounded-2xl shadow-lg relative overflow-hidden group cursor-pointer"
                        onClick={onBrowseClick}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={onDrop}
                        onPaste={onCardPaste}
                        role="button"
                        tabIndex={0}
                        aria-label="Upload screenshot"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        <div className={`flex flex-col sm:flex-row items-center gap-6 p-8 sm:p-10 border-2 border-dashed rounded-xl bg-background/80 transition-all relative z-10 min-h-[140px] ${
                          isDragOver ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                        }`}>
                          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform border border-border/50 shrink-0">
                            <Upload className="w-7 h-7 text-primary" />
                          </div>
                          <div className="text-center sm:text-left flex-1 space-y-2">
                            <h3 className="font-medium text-lg text-foreground">Upload Evidence</h3>
                            <p className="text-sm text-muted-foreground">
                              Drag & drop screenshots, emails, or PDFs here.
                            </p>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onBrowseClick(); }}
                            className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-3 rounded-full font-medium text-sm shadow-sm transition-colors flex items-center gap-2 min-w-[160px] justify-center"
                          >
                            Select File
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-2 py-4 px-6 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1 bg-secondary/30 rounded-b-xl">
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Secure Upload
                          </span>
                          <span className="hidden sm:block w-px h-3 bg-border" />
                          <span>PNG, JPG, PDF up to 10MB</span>
                          <span className="hidden sm:block w-px h-3 bg-border" />
                          <span>Anonymous Submission</span>
                        </div>
                      </div>
                    )}

                    {!isUploading && mode === "forward" && (
                      <div className="bg-background/50 backdrop-blur-sm border border-border p-2 rounded-2xl shadow-lg relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50 pointer-events-none" />

                        <div className="flex flex-col sm:flex-row items-center gap-6 p-8 sm:p-10 border-2 border-border rounded-xl bg-background/80 transition-all relative z-10 min-h-[140px]">
                          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shadow-sm border border-border/50 shrink-0">
                            <Mail className="w-7 h-7 text-primary" />
                          </div>
                          <div className="text-center sm:text-left flex-1 space-y-2">
                            <h3 className="font-medium text-lg text-foreground">Forward Emails To</h3>
                            <p className="text-sm text-muted-foreground">Redact personal info before forwarding.</p>
                          </div>
                          <button
                            className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-3 rounded-full font-medium shadow-sm transition-all flex items-center gap-2 min-w-[160px] justify-center relative"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText("submit@abjail.org");
                                setCopied(true);
                                if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
                                copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            <code className="font-mono text-xs">submit@abjail.org</code>
                            <Copy className="w-4 h-4" />
                            {copied && (
                              <div role="status" aria-live="polite" className="absolute -top-10 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs rounded px-2 py-1 shadow whitespace-nowrap">
                                Copied!
                              </div>
                            )}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-2 py-4 px-6 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1 bg-secondary/30 rounded-b-xl">
                          <span className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Secure Forwarding
                          </span>
                          <span className="hidden sm:block w-px h-3 bg-border" />
                          <span>Recently forwarded emails will appear below</span>
                        </div>

                        {/* Forwarded cases list */}
                        {forwardedCases.length > 0 && (
                          <div className="mt-2 space-y-2 p-4">
                            {forwardedCases.map((case_) => (
                              <div key={case_.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                                    {case_.senderName || "Unknown sender"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    {case_.status === 'processing' ? (
                                      <>
                                        <span className="inline-block h-4 w-4 rounded-full border-2 border-border border-t-primary animate-spin" />
                                        <span>Processing</span>
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                                        <span>Complete</span>
                                      </>
                                    )}
                                  </div>
                                  {case_.status === 'complete' && (
                                    <Link
                                      href={`/cases/${case_.id}`}
                                      className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                                    >
                                      Open case
                                    </Link>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Upload progress */}
                    {isUploading && (
                      <div className="bg-background/50 backdrop-blur-sm border border-border p-8 rounded-2xl shadow-lg">
                        <div className="text-center mb-6">
                          <h3 className="font-medium text-lg text-foreground mb-2">Working on your upload…</h3>
                          <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
                        </div>
                        <ol className="flex items-center justify-between gap-2 max-w-md mx-auto">
                          {['Uploading', 'Extracting', 'Finishing'].map((label, idx) => {
                            const isDone = idx < stepIndex;
                            const isCurrent = idx === stepIndex;
                            return (
                              <li key={label} className="flex-1 min-w-0">
                                <div className="flex items-center">
                                  <div className={`flex items-center justify-center h-8 w-8 rounded-full border text-xs font-semibold shrink-0 ${
                                    isDone ? 'bg-primary text-primary-foreground border-primary' : isCurrent ? 'bg-background text-foreground border-primary' : 'bg-background text-muted-foreground border-border'
                                  }`} aria-current={isCurrent ? 'step' : undefined}>
                                    {isDone ? '✓' : idx + 1}
                                  </div>
                                  {idx < 2 && (
                                    <div className={`mx-2 h-[2px] flex-1 rounded ${isDone ? 'bg-primary' : 'bg-border'}`} />
                                  )}
                                </div>
                                <div className={`mt-2 text-center text-xs ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {label}
                                  {isCurrent && (
                                    <span className="ml-2 align-middle">
                                      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-border border-t-primary animate-spin" />
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    )}

                    {/* Status message */}
                    {!isUploading && status && (
                      <div className="mt-4 text-sm text-center text-foreground bg-background/80 border border-border rounded-lg p-3">
                        {status}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={onInputChange} />

          {/* Recent Cases & Leaderboard */}
          <RecentActivitySection />

          {/* Reports to ActBlue */}
          <ReportsSection />

          {/* How it works */}
          <HowItWorksSection />
        </main>

        {/* Footer */}
        <Footer onScrollToSubmission={scrollToSubmission} />
      </div>
    </>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate());
  const month = String(d.getMonth() + 1);
  const year = String(d.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

type RecentCase = {
  id: string;
  created_at: string;
  sender_id: string | null;
  sender_name: string | null;
  raw_text: string | null;
  image_url: string | null;
  message_type: string | null;
  forwarder_email: string | null;
  violations: Array<{ code: string; title: string; actblue_verified?: boolean | null }>;
};

type WorstOffender = {
  sender_name: string;
  violation_count: number;
  latest_violation_at: string;
};

type ReportData = {
  report: {
    id: string;
    case_id: string;
    to_email: string;
    cc_email: string | null;
    subject: string;
    body: string;
    screenshot_url: string | null;
    landing_url: string;
    status: string;
    created_at: string;
  };
  case: {
    id: string;
    sender_name: string | null;
    sender_id: string | null;
    raw_text: string | null;
    image_url: string | null;
    created_at: string | null;
    message_type: string | null;
    email_body: string | null;
  };
  verdict: {
    id: string;
    verdict: string;
    explanation: string | null;
    determined_by: string | null;
    created_at: string | null;
    updated_at: string | null;
  } | null;
  violations: Array<{
    code: string;
    title: string;
  }>;
};

type PlatformStatus = {
  actblue_reporting_status: 'active' | 'offline';
  bot_network_sender_count: number;
};

type HomepageStats = {
  recent_cases: RecentCase[];
  worst_offenders: WorstOffender[];
  recent_reports: ReportData[];
  platform_status: PlatformStatus | null;
};

function useHomepageStats() {
  const [stats, setStats] = useState<HomepageStats>({ recent_cases: [], worst_offenders: [], recent_reports: [], platform_status: null });
  const [loading, setLoading] = useState<boolean>(true);
  
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const url = `/api/homepage-stats?recent=5&offenders=10&days=90&reports=5`;
        const json = await cachedJsonFetch<HomepageStats>(url, 300_000);
        if (!cancelled) setStats(json || { recent_cases: [], worst_offenders: [], recent_reports: [], platform_status: null });
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  
  return { stats, loading };
}

function RecentActivitySection() {
  const { stats, loading } = useHomepageStats();
  const cases = stats.recent_cases || [];
  const offenders = stats.worst_offenders || [];
  const platformStatus = stats.platform_status;
  const router = useRouter();

  return (
    <section className="py-16 md:py-24 overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-3 gap-12 lg:gap-16">
          {/* Main Feed */}
          <div className="lg:col-span-2 space-y-8 overflow-hidden">
            <div className="border-b border-border pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    className="text-2xl font-medium"
                    style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
                  >
                    Recent Activity
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Latest reports from the community.
                  </p>
                </div>
                {/* Desktop / tablet link (right-aligned) */}
                <Link
                  href="/cases"
                  className="hidden sm:inline-flex text-sm font-medium text-foreground hover:text-primary items-center gap-1 transition-colors shrink-0"
                >
                  View full archive
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {/* Mobile link, full-width row */}
              <Link
                href="/cases"
                className="mt-2 inline-flex sm:hidden text-sm font-medium text-foreground hover:text-primary items-center gap-1 transition-colors"
              >
                View all
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2">
              {loading && (
                [...Array(5)].map((_, idx) => (
                  <div key={`skeleton-${idx}`} className="animate-pulse p-4 rounded-lg">
                    <div className="h-5 bg-secondary rounded w-1/3 mb-2" />
                    <div className="h-4 bg-secondary rounded w-2/3" />
                  </div>
                ))
              )}
              {!loading && cases.map((item) => {
                const messageType = item.message_type?.toLowerCase();
                const isBot = isBotSubmitted({
                  messageType: item.message_type,
                  imageUrl: item.image_url,
                  senderId: item.sender_id,
                  forwarderEmail: item.forwarder_email,
                });
                const violationType = item.violations?.[0]?.actblue_verified 
                  ? "ActBlue Permitted Matching Program" 
                  : item.violations?.[0]?.title || "No violations detected";
                
                return (
                  <div
                    key={item.id}
                    className="group p-4 rounded-lg border border-transparent hover:border-border hover:bg-secondary/20 transition-all cursor-pointer overflow-hidden"
                    onClick={() => router.push(`/cases/${item.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/cases/${item.id}`);
                      }
                    }}
                  >
                    {/* Desktop layout */}
                    <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <h3 className="font-medium text-foreground truncate">{item.sender_name || item.sender_id || "Unknown sender"}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{violationType}</span>
                          </span>
                          <span className="w-1 h-1 rounded-full bg-border shrink-0" />
                          <span className="shrink-0">{messageType === 'email' ? 'Email' : messageType === 'sms' ? 'SMS' : messageType === 'mms' ? 'MMS' : 'Unknown'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-medium text-foreground">{isBot ? 'Bot Captured' : 'User Submitted'}</div>
                          <div className="text-xs text-muted-foreground">{formatWhen(item.created_at)}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Mobile layout - single-column, no horizontal pressure */}
                    <div className="sm:hidden space-y-2">
                      <h3 className="font-medium text-foreground leading-tight break-words">
                        {item.sender_name || item.sender_id || "Unknown sender"}
                      </h3>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{violationType}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                          {messageType === "email"
                            ? "Email"
                            : messageType === "sms"
                            ? "SMS"
                            : messageType === "mms"
                            ? "MMS"
                            : "Unknown"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                          {isBot ? "Bot Captured" : "User Submitted"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatWhen(item.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!loading && cases.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">No cases yet.</div>
              )}
            </div>
          </div>

          {/* Sidebar / Leaderboard */}
          <div className="space-y-12">
            <div className="bg-card/50 rounded-xl p-5 border border-border/50">
              <div className="flex items-center justify-between mb-1">
                <h3
                  className="font-medium text-lg"
                  style={{ fontFamily: "var(--font-playfair), ui-serif, Georgia, serif" }}
                >
                  Repeat Offenders
                </h3>
                <span className="hidden sm:inline text-xs text-muted-foreground">Last 90 days</span>
              </div>
              <span className="block sm:hidden text-xs text-muted-foreground mb-4">Last 90 days</span>

              <div className="space-y-3">
                {/* Desktop column headers */}
                <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-3 pb-2 border-b border-border/50">
                  <span className="text-xs font-medium text-muted-foreground">Organization</span>
                  <span className="text-xs font-medium text-muted-foreground text-right">Violations</span>
                  <span className="text-xs font-medium text-muted-foreground text-right w-20">Latest</span>
                </div>

                {loading && (
                  [...Array(5)].map((_, idx) => (
                    <div key={`offender-skeleton-${idx}`} className="animate-pulse flex items-center justify-between gap-3 py-2">
                      <div className="h-4 bg-secondary rounded w-1/2" />
                      <div className="h-4 bg-secondary rounded w-16" />
                    </div>
                  ))
                )}
                {!loading &&
                  offenders.slice(0, 5).map((org) => (
                    <div
                      key={org.sender_name}
                      className="group -mx-2 px-2 py-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/cases?senders=${encodeURIComponent(org.sender_name)}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/cases?senders=${encodeURIComponent(org.sender_name)}`);
                        }
                      }}
                    >
                      {/* Desktop / tablet layout: table-style with headers */}
                      <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                        <span className="text-sm font-medium text-foreground truncate min-w-0">{org.sender_name}</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums text-right">
                          {org.violation_count}
                        </span>
                        <span className="text-xs text-muted-foreground text-right w-20 shrink-0">
                          {formatShortDate(org.latest_violation_at)}
                        </span>
                      </div>

                      {/* Mobile layout: stacked with clear labels */}
                      <div className="sm:hidden space-y-1">
                        <span className="text-sm font-medium text-foreground break-words">
                          {org.sender_name}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground tabular-nums">
                            {org.violation_count}
                          </span>
                          <span>violations</span>
                          <span className="w-1 h-1 rounded-full bg-border" />
                          <span>latest: {formatWhen(org.latest_violation_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                {!loading && offenders.length === 0 && (
                  <div className="py-4 text-center text-sm text-muted-foreground">No offenders yet.</div>
                )}
              </div>

              <Link href="/stats" className="w-full mt-5 pt-4 border-t border-border/50 text-sm font-medium text-muted-foreground hover:text-primary flex items-center justify-center gap-1.5 transition-colors">
                View full leaderboard <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>Platform Status</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className={`w-4 h-4 mt-0.5 ${platformStatus?.actblue_reporting_status === 'active' ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="font-medium text-foreground">ActBlue Reporting {platformStatus?.actblue_reporting_status === 'active' ? 'Active' : 'Offline'}</div>
                    <p className="text-muted-foreground text-xs mt-0.5">Direct reporting channel is {platformStatus?.actblue_reporting_status === 'active' ? 'operational' : 'currently offline'}.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-foreground">Bot Network Online</div>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Currently monitoring {platformStatus?.bot_network_sender_count || 0} active senders.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportsSection() {
  const { stats, loading } = useHomepageStats();
  const reports = stats.recent_reports || [];
  const router = useRouter();

  return (
    <section className="py-16 bg-secondary/30">
      <div className="container mx-auto px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-medium mb-1" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>Reports to ActBlue</h2>
            <p className="text-sm text-muted-foreground">User-initiated reports submitted to ActBlue for review.</p>
          </div>
          <Link href="/reports" className="text-sm font-medium hover:text-primary flex items-center gap-1 transition-colors self-start sm:self-auto">
            View all reports <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading && (
            [...Array(4)].map((_, idx) => (
              <div key={`report-skeleton-${idx}`} className="animate-pulse bg-background rounded-lg border border-border/50 p-5 h-48">
                <div className="h-3 bg-secondary rounded w-16 mb-3" />
                <div className="h-5 bg-secondary rounded w-3/4 mb-4" />
                <div className="h-4 bg-secondary rounded w-full mb-2" />
                <div className="h-4 bg-secondary rounded w-2/3" />
              </div>
            ))
          )}
          {!loading && reports.slice(0, 4).map((reportData) => {
            const date = new Date(reportData.report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const verdict = reportData.verdict?.verdict || 'pending';
            
            return (
              <div
                key={reportData.report.id}
                className="group bg-background rounded-lg border border-border/50 p-5 hover:border-border hover:shadow-sm transition-all cursor-pointer flex flex-col h-full"
                onClick={() => router.push(`/cases/${reportData.case.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/cases/${reportData.case.id}`);
                  }
                }}
              >
                <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider mb-2">
                  {date}
                </span>
                <h3 className="font-medium text-base leading-snug mb-4 text-foreground">{reportData.case.sender_name || reportData.case.sender_id || 'Unknown'}</h3>
                <div className="space-y-2 flex-1 mb-4">
                  {reportData.violations.slice(0, 2).map((v, j) => (
                    <p key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>{v.title}</span>
                    </p>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <span className={`text-xs font-medium ${
                    verdict === 'pending' || verdict === 'under_review' 
                      ? 'text-muted-foreground' 
                      : verdict === 'no_violation' || verdict === 'resolved'
                        ? 'text-primary' 
                        : 'text-destructive'
                  }`}>
                    {verdict === 'pending' ? 'Awaiting Response' 
                      : verdict === 'under_review' ? 'Under Review'
                      : verdict === 'no_violation' ? 'No Violation Found' 
                      : verdict === 'resolved' ? 'Resolved'
                      : verdict === 'violation_confirmed' ? 'Violation Confirmed'
                      : 'Awaiting Response'}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                </div>
              </div>
            );
          })}
          {!loading && reports.length === 0 && (
            <div className="col-span-4 py-8 text-center text-sm text-muted-foreground">No reports yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="py-24 section-inverted">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mb-16">
          <h2 className="text-3xl md:text-4xl font-medium mb-6" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>
            How we hold deceptive political fundraisers accountable
          </h2>
          <p className="text-muted-foreground text-lg">
            We combine user submissions and automated monitoring to collect fundraising messages, analyze them for
            potential violations and reporting to ActBlue with a full public record.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 border-t border-white/10 pt-12">
          <div className="space-y-4">
            <div className="text-4xl text-white/20" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>01</div>
            <h3 className="text-xl font-medium">Capture at Scale</h3>
            <p className="text-muted-foreground leading-relaxed">
              Forwarded emails, screenshot uploads, and automated bot accounts collect fundraising messages.
            </p>
          </div>
          <div className="space-y-4">
            <div className="text-4xl text-white/20" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>02</div>
            <h3 className="text-xl font-medium">Analyze &amp; Archive</h3>
            <p className="text-muted-foreground leading-relaxed">
              AI extracts text, screenshots the ActBlue page, and flags potential violations. We create a public
              case for every message.
            </p>
          </div>
          <div className="space-y-4">
            <div className="text-4xl text-white/20" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>03</div>
            <h3 className="text-xl font-medium">Report to ActBlue</h3>
            <p className="text-muted-foreground leading-relaxed">
              Users may report potential violations with one click, and responses from ActBlue are tracked on the
              case page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
