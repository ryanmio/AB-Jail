"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { VIOLATION_POLICIES, AUP_HELP_URL } from "@/lib/violation-policies";
import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";

const REQUIRED_EVALUATIONS = 20;

type Sample = {
  id: string;
  imageUrl: string;
  senderId: string | null;
  senderName: string | null;
  rawText: string | null;
  messageType: string | null;
  aiConfidence: number | null;
  createdAt: string;
  landingUrl: string | null;
  landingScreenshotUrl: string | null;
  emailBody: string | null;
  emailSubject?: string | null;
  emailFrom?: string | null;
  aiViolations: Array<{ code: string; title: string; description: string; confidence: number }>;
};

export default function EvaluationPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [evaluatedIds, setEvaluatedIds] = useState<string[]>([]);
  const [selectedViolations, setSelectedViolations] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"image" | "html" | "text" | "landing">("image");
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  // Initialize device ID and load progress from localStorage
  useEffect(() => {
    // Generate or retrieve device ID
    let storedDeviceId = localStorage.getItem("eval_device_id");
    if (!storedDeviceId) {
      storedDeviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("eval_device_id", storedDeviceId);
    }
    setDeviceId(storedDeviceId);

    // Load session ID and progress
    const storedSessionId = localStorage.getItem("eval_session_id");
    if (storedSessionId) {
      setSessionId(storedSessionId);
    }

    const storedEvaluatedIds = localStorage.getItem("eval_evaluated_ids");
    if (storedEvaluatedIds) {
      try {
        setEvaluatedIds(JSON.parse(storedEvaluatedIds));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Fetch samples
  useEffect(() => {
    if (!deviceId) return;

    const fetchSamples = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const excludeParam = evaluatedIds.length > 0 ? `&exclude=${evaluatedIds.join(",")}` : "";
        const response = await fetch(`/api/evaluation/samples?count=${REQUIRED_EVALUATIONS}${excludeParam}`);
        
        if (!response.ok) {
          throw new Error("Failed to fetch samples");
        }

        const data = await response.json();
        setSamples(data.samples || []);
      } catch (err) {
        console.error("Error fetching samples:", err);
        setError("Failed to load evaluation samples. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    };

    fetchSamples();
  }, [deviceId, evaluatedIds]);

  const currentSample = samples[currentIndex];

  // Set default tab based on what's available
  useEffect(() => {
    if (currentSample) {
      const hasImage = currentSample.imageUrl !== null && currentSample.imageUrl !== undefined;
      const hasHtml = currentSample.emailBody !== null && currentSample.emailBody !== undefined && currentSample.emailBody.trim().length > 0;
      const hasLanding = currentSample.landingScreenshotUrl !== null && currentSample.landingScreenshotUrl !== undefined;
      
      // Priority: HTML (for emails) > Image > Text > Landing
      if (hasHtml) {
        setActiveTab("html");
      } else if (hasImage) {
        setActiveTab("image");
      } else if (currentSample.rawText) {
        setActiveTab("text");
      } else if (hasLanding) {
        setActiveTab("landing");
      } else {
        setActiveTab("text");
      }
    }
  }, [currentIndex, samples, currentSample]);
  const progress = evaluatedIds.length;
  const progressPercent = Math.min((progress / REQUIRED_EVALUATIONS) * 100, 100);
  const canSubmit = progress >= REQUIRED_EVALUATIONS;
  const maxEvaluations = 50;

  const handleToggleViolation = (code: string) => {
    setSelectedViolations((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSaveEvaluation = async () => {
    if (!currentSample || !deviceId) return;

    setSubmitting(true);
    setError(null);

    try {
      const aiViolationCodes = currentSample.aiViolations.map((v) => v.code);

      const response = await fetch("/api/evaluation/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          deviceId,
          submissionId: currentSample.id,
          manualViolations: selectedViolations,
          evaluatorNotes: notes.trim() || null,
          aiViolations: aiViolationCodes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === "duplicate_evaluation") {
          // Already evaluated, skip to next
          console.log("Already evaluated, moving to next");
        } else {
          throw new Error(errorData.error || "Failed to submit evaluation");
        }
      } else {
        const data = await response.json();
        
        // Store session ID if not already set
        if (!sessionId && data.sessionId) {
          setSessionId(data.sessionId);
          localStorage.setItem("eval_session_id", data.sessionId);
        }
      }

      // Update evaluated IDs and save to localStorage
      const newEvaluatedIds = [...evaluatedIds, currentSample.id];
      setEvaluatedIds(newEvaluatedIds);
      localStorage.setItem("eval_evaluated_ids", JSON.stringify(newEvaluatedIds));

      // Reset form and move to next
      setSelectedViolations([]);
      setNotes("");
      
      // Check if we just completed 20 evaluations
      if (newEvaluatedIds.length === REQUIRED_EVALUATIONS) {
        // Show completion modal
        setShowCompletionModal(true);
      } else if (currentIndex < samples.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // Need more samples
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error("Error submitting evaluation:", err);
      setError("Failed to save evaluation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipToNext = () => {
    if (currentIndex < samples.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedViolations([]);
      setNotes("");
    }
  };

  const handleViewResults = () => {
    router.push(`/evaluation/results?sessionId=${sessionId}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen" data-theme="v2">
        <Header isHomepage={false} />
        <main className="flex-1 flex items-center justify-center p-4 bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading evaluation samples...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error && samples.length === 0) {
    return (
      <div className="flex flex-col min-h-screen" data-theme="v2">
        <Header isHomepage={false} />
        <main className="flex-1 flex items-center justify-center p-4 bg-background">
          <div className="bg-card p-8 rounded-sm shadow-lg max-w-md border border-border">
            <h2 className="text-xl font-bold text-destructive mb-4">Error</h2>
            <p className="text-foreground mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-sm hover:bg-primary/90 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!currentSample && samples.length === 0) {
    return (
      <div className="flex flex-col min-h-screen" data-theme="v2">
        <Header isHomepage={false} />
        <main className="flex-1 flex items-center justify-center p-4 bg-background">
          <div className="bg-card p-8 rounded-sm shadow-lg max-w-md border border-border">
            <h2 className="text-xl font-bold mb-4 text-foreground">No Samples Available</h2>
            <p className="text-muted-foreground">
              There are no evaluation samples available at this time. Please check back later.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hasImage = currentSample?.imageUrl !== null && currentSample?.imageUrl !== undefined;
  const hasHtml = currentSample?.emailBody !== null && currentSample?.emailBody !== undefined && currentSample.emailBody.trim().length > 0;
  const hasLanding = currentSample?.landingScreenshotUrl !== null && currentSample?.landingScreenshotUrl !== undefined;

  return (
    <div className="flex flex-col min-h-screen" data-theme="v2">
      <Header isHomepage={false} />

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-sm shadow-2xl max-w-lg w-full p-8 animate-in fade-in zoom-in duration-200 border border-border">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 
                className="text-2xl font-bold text-foreground mb-2"
                style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
              >
                Great work! 🎉
              </h2>
              <p className="text-muted-foreground">
                You&apos;ve completed the minimum {REQUIRED_EVALUATIONS} evaluations.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => {
                  setShowCompletionModal(false);
                  router.push(`/evaluation/results?sessionId=${sessionId}`);
                }}
                className="w-full bg-primary text-primary-foreground py-4 px-6 rounded-sm hover:bg-primary/90 font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                View My Results
              </button>
              <button
                onClick={() => {
                  setShowCompletionModal(false);
                  if (currentIndex < samples.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                  }
                }}
                className="w-full bg-card border-2 border-border text-foreground py-4 px-6 rounded-sm hover:bg-secondary/20 font-semibold transition-all"
              >
                Continue Evaluating (up to {maxEvaluations})
              </button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              More evaluations help improve the AI&apos;s accuracy!
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 bg-background">
        {/* Hero Section */}
        <section className="py-8 md:py-12 border-b border-border/40 bg-secondary/20">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            <h1 
              className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.1] mb-2"
              style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
            >
              AI Training
            </h1>
            <p className="text-muted-foreground">
              Review each case and select violations you believe should be flagged.
            </p>
          </div>
        </section>

        {/* Progress & Main Content */}
        <section className="py-6">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            {/* Progress Bar */}
            <div className="mb-6 bg-card rounded-sm shadow-sm p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Progress: {progress} / {REQUIRED_EVALUATIONS}
                </span>
                <div className="text-xs text-muted-foreground">
                  {sessionId && (
                    <HoverCard openDelay={200}>
                      <HoverCardTrigger asChild>
                        <button className="font-mono bg-secondary px-2 py-1 rounded-sm hover:bg-secondary/80 transition-colors cursor-help text-secondary-foreground">
                          Session: {sessionId.slice(0, 8)}...
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 bg-card border-border">
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-foreground mb-1">
                              Your Session ID:
                            </p>
                            <code className="text-xs text-foreground bg-secondary px-2 py-1 rounded-sm block break-all">
                              {sessionId}
                            </code>
                            <p className="text-xs text-muted-foreground mt-2">
                              Your progress is anonymously saved with this session ID.
                            </p>
                          </div>
                          <div className="border-t border-border pt-2">
                            <button
                              onClick={() => {
                                if (confirm("Start a new evaluation session? Your current progress will be saved, but you'll begin evaluating new cases.")) {
                                  localStorage.removeItem("eval_session_id");
                                  localStorage.removeItem("eval_evaluated_ids");
                                  window.location.reload();
                                }
                              }}
                              className="w-full text-xs bg-primary text-primary-foreground py-2 px-3 rounded-sm hover:bg-primary/90 font-medium transition-colors"
                            >
                              Start New Session
                            </button>
                          </div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  )}
                </div>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              {canSubmit && (
                <button
                  onClick={handleViewResults}
                  className="mt-3 w-full bg-green-500 text-white py-2 px-4 rounded-sm hover:bg-green-600 font-medium transition-all shadow-sm"
                >
                  ✓ View Results & Complete Evaluation
                </button>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-sm text-sm">
                {error}
              </div>
            )}

            {/* Main Content Grid */}
            {currentSample && (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Left: Case Content with Tabs */}
                <div className="bg-card rounded-sm shadow-md overflow-hidden border border-border">
                  {/* AI Violations - At Top */}
                  <div className="border-b border-border bg-secondary/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${
                        currentSample.aiViolations.length > 0 ? 'bg-destructive' : 'bg-green-500'
                      }`}></div>
                      <h3 className="text-sm font-semibold text-foreground">
                        AI-Detected Violations
                      </h3>
                      <span className="text-xs text-muted-foreground font-medium">
                        {currentSample.aiViolations.length} found
                      </span>
                    </div>
                    {currentSample.aiViolations.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {currentSample.aiViolations.map((violation) => (
                          <HoverCard key={violation.code} openDelay={200}>
                            <HoverCardTrigger asChild>
                              <button className="inline-flex items-center bg-card border border-destructive/30 rounded-sm px-3 py-1.5 text-xs font-medium text-destructive cursor-help hover:bg-destructive/5 hover:border-destructive/50 transition-all duration-200 shadow-sm">
                                <span className="font-semibold">{violation.code}</span>
                                <span className="ml-2 font-normal opacity-80">
                                  {Math.round((violation.confidence || 0) * 100)}%
                                </span>
                              </button>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80 bg-foreground text-background border-foreground">
                              <div className="space-y-2">
                                <h4 className="font-bold text-sm">
                                  {violation.code}: {violation.title}
                                </h4>
                                <p className="text-xs opacity-80 leading-relaxed">
                                  {violation.description || "No description provided"}
                                </p>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No violations detected</p>
                    )}
                  </div>

                  {/* Tab Bar */}
                  <div className="flex border-b border-border bg-secondary/20">
                    {/* Show HTML tab for emails, Image tab for others */}
                    {hasHtml ? (
                      <button
                        onClick={() => setActiveTab("html")}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-colors relative ${
                          activeTab === "html"
                            ? "bg-card border-b-2 border-primary text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                        }`}
                      >
                        📧 HTML
                        <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                          currentSample.aiViolations.length > 0 ? 'bg-destructive' : 'bg-green-500'
                        }`}></span>
                      </button>
                    ) : (
                      <button
                        onClick={() => hasImage && setActiveTab("image")}
                        disabled={!hasImage}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-colors relative ${
                          activeTab === "image"
                            ? "bg-card border-b-2 border-primary text-primary"
                            : hasImage
                            ? "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                            : "text-muted-foreground/50 cursor-not-allowed"
                        }`}
                      >
                        📸 Image
                        {hasImage && (
                          <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                            currentSample.aiViolations.length > 0 ? 'bg-destructive' : 'bg-green-500'
                          }`}></span>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setActiveTab("text")}
                      className={`flex-1 py-3 px-4 text-sm font-medium transition-colors relative ${
                        activeTab === "text"
                          ? "bg-card border-b-2 border-primary text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                      }`}
                    >
                      📄 Text
                      <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                        currentSample.aiViolations.length > 0 ? 'bg-destructive' : 'bg-green-500'
                      }`}></span>
                    </button>
                    <button
                      onClick={() => hasLanding && setActiveTab("landing")}
                      disabled={!hasLanding}
                      className={`flex-1 py-3 px-4 text-sm font-medium transition-colors relative ${
                        activeTab === "landing"
                          ? "bg-card border-b-2 border-primary text-primary"
                          : hasLanding
                          ? "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                          : "text-muted-foreground/50 cursor-not-allowed"
                      }`}
                    >
                      🌐 Landing
                      {hasLanding && (
                        <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                          currentSample.aiViolations.length > 0 ? 'bg-destructive' : 'bg-green-500'
                        }`}></span>
                      )}
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="p-4 max-h-[600px] overflow-y-auto">
                    {activeTab === "html" && (
                      <div>
                        {hasHtml && currentSample.emailBody ? (
                          <div>
                            {(currentSample.emailFrom || currentSample.emailSubject) && (
                              <div className="mb-3">
                                {currentSample.emailFrom && (
                                  <div className="text-sm text-foreground">
                                    <span className="font-semibold">From:</span>{" "}
                                    <span className="break-all">{currentSample.emailFrom}</span>
                                  </div>
                                )}
                                {currentSample.emailSubject && (
                                  <div className="text-sm text-foreground mt-1">
                                    <span className="font-semibold">Subject:</span>{" "}
                                    <span className="break-words">{currentSample.emailSubject}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="w-full bg-card rounded-sm border border-border overflow-hidden">
                            <div className="max-h-128 overflow-auto flex justify-center">
                              <div className="scale-[0.6] origin-top" style={{ width: "calc(100% / 0.6)" }}>
                                <div 
                                  className="prose prose-sm max-w-none text-foreground text-xs prose-headings:text-sm"
                                  dangerouslySetInnerHTML={{ __html: currentSample.emailBody }}
                                />
                              </div>
                            </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center bg-secondary/30 rounded-sm p-12">
                            <div className="text-center text-muted-foreground">
                              <svg
                                className="w-16 h-16 mx-auto mb-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                              </svg>
                              <p className="font-medium">No HTML available</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "image" && (
                      <div>
                        {hasImage ? (
                          <Image
                            src={currentSample.imageUrl}
                            alt="Message screenshot"
                            width={800}
                            height={1000}
                            className="w-full h-auto rounded-sm"
                          />
                        ) : (
                          <div className="flex items-center justify-center bg-secondary/30 rounded-sm p-12">
                            <div className="text-center text-muted-foreground">
                              <svg
                                className="w-16 h-16 mx-auto mb-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              <p className="font-medium">No image available</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "text" && (
                      <div className="bg-secondary/30 rounded-sm p-4">
                        <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
                          {currentSample.rawText || "(No text extracted)"}
                        </pre>
                      </div>
                    )}

                    {activeTab === "landing" && (
                      <div>
                        {hasLanding && currentSample.landingScreenshotUrl ? (
                          <div>
                            <Image
                              src={currentSample.landingScreenshotUrl}
                              alt="Landing page screenshot"
                              width={800}
                              height={1000}
                              className="w-full h-auto rounded-sm"
                            />
                            {currentSample.landingUrl && (
                              <a
                                href={currentSample.landingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 inline-flex items-center text-sm text-primary hover:text-primary/80 transition-colors"
                              >
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                View live page
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center bg-secondary/30 rounded-sm p-12">
                            <div className="text-center text-muted-foreground">
                              <svg
                                className="w-16 h-16 mx-auto mb-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                />
                              </svg>
                              <p className="font-medium">No landing page provided</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Evaluation Form */}
                <div className="bg-card rounded-sm shadow-md p-4 border border-border">
                  <h2 
                    className="text-lg font-bold mb-3 text-foreground"
                    style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
                  >
                    Your Evaluation
                  </h2>
                  
                  {/* Violation Grid - More Compact */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {VIOLATION_POLICIES.map((policy) => (
                      <HoverCard key={policy.code} openDelay={300}>
                        <HoverCardTrigger asChild>
                          <button
                            onClick={() => handleToggleViolation(policy.code)}
                            className={`p-2 rounded-sm border text-left transition-all text-xs ${
                              selectedViolations.includes(policy.code)
                                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                : "border-border bg-card hover:border-border hover:bg-secondary/20"
                            }`}
                          >
                            <div className="font-bold text-foreground">{policy.code}</div>
                            <div className="text-muted-foreground leading-tight">{policy.title}</div>
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent 
                          className="w-96 bg-card border-border" 
                          side="right"
                          style={{ color: '#1a1a2e' }}
                        >
                          <div className="space-y-3">
                            <div>
                              <h4 className="font-bold text-sm mb-1" style={{ color: '#1a1a2e', fontWeight: 700 }}>
                                {policy.code}: {policy.title}
                              </h4>
                            </div>
                            <div className="border-t border-border pt-2">
                              <p className="text-xs font-semibold mb-1" style={{ color: '#1a1a2e', fontWeight: 600 }}>
                                ActBlue Policy:
                              </p>
                              <p className="text-xs leading-relaxed" style={{ color: '#4a5568' }}>
                                {policy.policy}
                              </p>
                            </div>
                            <div className="border-t border-border pt-2">
                              <a
                                href={AUP_HELP_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-xs text-primary hover:text-primary/80 font-medium"
                              >
                                View full ActBlue AUP
                                <svg
                                  className="w-3 h-3 ml-1"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </a>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    ))}
                  </div>

                  {/* Selected Summary */}
                  <div className="mb-4 p-3 bg-secondary/30 rounded-sm border border-border">
                    <div className="text-xs font-semibold text-foreground mb-1">
                      Selected ({selectedViolations.length})
                    </div>
                    {selectedViolations.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedViolations.map((code) => (
                          <span
                            key={code}
                            className="inline-block bg-primary text-primary-foreground rounded-sm px-2 py-0.5 text-xs font-medium"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No Violations</p>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Notes (optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => {
                        if (e.target.value.length <= 240) {
                          setNotes(e.target.value);
                        }
                      }}
                      placeholder="Any additional observations..."
                      className="w-full border border-border rounded-sm p-2 text-sm resize-none focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-muted-foreground bg-background text-foreground"
                      rows={3}
                    />
                    <div className="text-right text-xs text-muted-foreground mt-1">
                      {notes.length} / 240
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEvaluation}
                      disabled={submitting}
                      className="flex-1 bg-primary text-primary-foreground py-3 px-4 rounded-sm hover:bg-primary/90 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                    >
                      {submitting ? "Saving..." : "✓ Save & Next"}
                    </button>
                    <button
                      onClick={handleSkipToNext}
                      disabled={submitting || currentIndex >= samples.length - 1}
                      className="bg-secondary text-secondary-foreground py-3 px-4 rounded-sm hover:bg-secondary/80 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Skip
                    </button>
                  </div>

                  {/* Progress indicator */}
                  <div className="mt-3 text-center text-xs text-muted-foreground">
                    Case {currentIndex + 1} of {samples.length} loaded
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
