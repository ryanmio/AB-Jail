"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";

type Metrics = {
  totalEvaluations: number;
  exactMatches: number;
  accuracy: number;
  precision: number;
  recall: number;
  falsePositives: number;
  falseNegatives: number;
  truePositives: number;
  trueNegatives: number;
  totalSessions?: number;
};

type ResultsData = {
  sessionMetrics: Metrics | null;
  aggregateMetrics: Metrics | null;
};

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("sessionId");

  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      if (!sessionId) {
        setError("No session ID provided");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/evaluation/results?sessionId=${sessionId}&includeAggregate=true`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch results");
        }

        const resultsData = await response.json();
        setData(resultsData);
      } catch (err) {
        console.error("Error fetching results:", err);
        setError("Failed to load evaluation results. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

  const handleStartNew = () => {
    localStorage.removeItem("eval_session_id");
    localStorage.removeItem("eval_evaluated_ids");
    router.push("/evaluation");
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen" data-theme="v2">
        <Header isHomepage={false} />
        <main className="flex-1 flex items-center justify-center p-4 bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading results...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col min-h-screen" data-theme="v2">
        <Header isHomepage={false} />
        <main className="flex-1 flex items-center justify-center p-4 bg-background">
          <div className="bg-card p-8 rounded-sm shadow-lg max-w-md border border-border">
            <div className="w-12 h-12 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2 text-center">Error</h2>
            <p className="text-muted-foreground mb-6 text-center">{error || "Failed to load results"}</p>
            <button
              onClick={() => router.push("/evaluation")}
              className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-sm hover:bg-primary/90 transition-colors font-medium"
            >
              Back to Evaluation
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const { sessionMetrics, aggregateMetrics } = data;

  return (
    <div className="flex flex-col min-h-screen" data-theme="v2">
      <Header isHomepage={false} />

      <main className="flex-1 bg-background">
        {/* Hero Section */}
        <section className="border-b border-border/40 bg-secondary/20">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-sm flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h1 
                    className="text-2xl md:text-3xl font-bold text-foreground"
                    style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
                  >
                    AI Training Results
                  </h1>
                  <p className="text-sm text-muted-foreground">Your evaluation compared to AI detection</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-600 px-3 py-1.5 rounded-sm text-xs font-medium">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Complete
              </div>
            </div>
          </div>
        </section>

        <section className="py-6">
          <div className="max-w-6xl mx-auto px-6">
            {/* Your Session Results */}
            {sessionMetrics && (
              <div className="mb-8">
                <div className="mb-4">
                  <h2 
                    className="text-xl font-bold text-foreground"
                    style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
                  >
                    Your Session
                  </h2>
                  <p className="text-sm text-muted-foreground">Evaluated {sessionMetrics.totalEvaluations} cases</p>
                </div>

                {/* Primary Metrics with Hover Tooltips */}
                <div className="grid md:grid-cols-3 gap-3 mb-3">
                  <div className="group relative bg-card border border-border rounded-sm p-4 hover:shadow-lg hover:border-primary/30 transition-all cursor-help">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Accuracy</span>
                      <div className="w-7 h-7 bg-primary/10 rounded-sm flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-foreground mb-1">{sessionMetrics.accuracy}%</div>
                    <p className="text-xs text-muted-foreground">{sessionMetrics.exactMatches} of {sessionMetrics.totalEvaluations} exact matches</p>
                    
                    {/* Hover Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-foreground text-background text-xs rounded-sm p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                      <div className="font-bold mb-1">Accuracy</div>
                      <div className="opacity-80">Percentage of cases where AI matches your evaluation exactly</div>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-foreground"></div>
                      </div>
                    </div>
                  </div>

                  <div className="group relative bg-card border border-border rounded-sm p-4 hover:shadow-lg hover:border-primary/30 transition-all cursor-help">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Precision</span>
                      <div className="w-7 h-7 bg-primary/10 rounded-sm flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-foreground mb-1">{sessionMetrics.precision}%</div>
                    <p className="text-xs text-muted-foreground">Fewer false alarms</p>
                    
                    {/* Hover Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-foreground text-background text-xs rounded-sm p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                      <div className="font-bold mb-1">Precision</div>
                      <div className="opacity-80">When AI flags a violation, how often is it correct? (Fewer false alarms = better)</div>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-foreground"></div>
                      </div>
                    </div>
                  </div>

                  <div className="group relative bg-card border border-border rounded-sm p-4 hover:shadow-lg hover:border-green-500/30 transition-all cursor-help">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Detection Rate</span>
                      <div className="w-7 h-7 bg-green-500/10 rounded-sm flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-foreground mb-1">{sessionMetrics.recall}%</div>
                    <p className="text-xs text-muted-foreground">Fewer missed violations</p>
                    
                    {/* Hover Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-foreground text-background text-xs rounded-sm p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                      <div className="font-bold mb-1">Detection Rate</div>
                      <div className="opacity-80">Of all actual violations, what % does AI catch? (Fewer misses = better)</div>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-foreground"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Metrics */}
                <div className="grid md:grid-cols-4 gap-3">
                  <div className="group relative bg-card border border-border rounded-sm p-3 hover:shadow-md hover:border-border transition-all cursor-help">
                    <div className="text-xl font-bold text-foreground">{sessionMetrics.truePositives}</div>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5">True Positives</div>
                    
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-foreground text-background text-xs rounded-sm p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                      Correctly flagged violations
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-foreground"></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative bg-card border border-border rounded-sm p-3 hover:shadow-md hover:border-border transition-all cursor-help">
                    <div className="text-xl font-bold text-foreground">{sessionMetrics.trueNegatives}</div>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5">True Negatives</div>
                    
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-foreground text-background text-xs rounded-sm p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                      Correctly not flagged
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-foreground"></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative bg-card border border-destructive/30 rounded-sm p-3 hover:shadow-md hover:border-destructive/50 transition-all cursor-help">
                    <div className="text-xl font-bold text-destructive">{sessionMetrics.falsePositives}</div>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5">False Positives</div>
                    
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-foreground text-background text-xs rounded-sm p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                      AI incorrectly flagged violations
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-foreground"></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group relative bg-card border border-orange-300/50 rounded-sm p-3 hover:shadow-md hover:border-orange-400/50 transition-all cursor-help">
                    <div className="text-xl font-bold text-orange-600">{sessionMetrics.falseNegatives}</div>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5">False Negatives</div>
                    
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-foreground text-background text-xs rounded-sm p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                      AI missed violations
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                        <div className="border-4 border-transparent border-t-foreground"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-primary/5 border border-primary/20 rounded-sm p-4 mb-8">
              <div className="flex gap-3">
                <div className="w-5 h-5 bg-primary rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-1">How Your Data Improves AI Accuracy</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your manual evaluations help train the AI to be more accurate. By tagging cases, we can determine which violations need more specific detection instructions and which patterns to ignore, reducing both false positives (incorrect flags) and false negatives (missed violations).
                  </p>
                </div>
              </div>
            </div>

            {/* All Evaluators - Smaller */}
            {aggregateMetrics && aggregateMetrics.totalEvaluations > 0 && (
              <div className="mb-6">
                <div className="mb-3">
                  <h2 
                    className="text-lg font-bold text-foreground"
                    style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}
                  >
                    All Evaluators
                  </h2>
                  <p className="text-xs text-muted-foreground">{aggregateMetrics.totalEvaluations} evaluations across {aggregateMetrics.totalSessions || "all"} sessions</p>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <div className="bg-card border border-border rounded-sm p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Accuracy</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground mb-0.5">{aggregateMetrics.accuracy}%</div>
                    <p className="text-xs text-muted-foreground">{aggregateMetrics.exactMatches} of {aggregateMetrics.totalEvaluations}</p>
                  </div>

                  <div className="bg-card border border-border rounded-sm p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Precision</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground mb-0.5">{aggregateMetrics.precision}%</div>
                    <p className="text-xs text-muted-foreground">Average</p>
                  </div>

                  <div className="bg-card border border-border rounded-sm p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Detection Rate</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground mb-0.5">{aggregateMetrics.recall}%</div>
                    <p className="text-xs text-muted-foreground">Average</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleStartNew}
                className="flex-1 bg-primary text-primary-foreground py-3 px-6 rounded-sm hover:bg-primary/90 font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                Start New Evaluation
              </button>
              <button
                onClick={() => router.push("/")}
                className="flex-1 bg-card border-2 border-border text-foreground py-3 px-6 rounded-sm hover:bg-secondary/20 font-semibold transition-all"
              >
                Return to Home
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default function EvaluationResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen" data-theme="v2">
          <Header isHomepage={false} />
          <main className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </main>
          <Footer />
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
