"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type OnboardingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl?: string;
};

const STEPS = [
  {
    title: "What is AB Jail?",
    description: (
      <>
        <strong>AB Jail is a public transparency tool that documents deceptive political fundraising</strong>. We continuously collect campaign emails and texts to flag potential violations of fundraising platform policies and make those patterns visible and accountable.
      </>
    ),
    icon: (
      <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "How it works",
    description: (
      <>
        Anyone can contribute: <strong>forward a deceptive fundraising email to submit@abjail.org or upload a screenshot</strong> to create a public case. We automatically identify potential violations of ActBlue’s Account Use Policy and make the evidence public for accountability.
      </>
    ),
    icon: (
      <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    title: "Reporting violations",
    description: (
      <>
        <strong>File a report with one click</strong>, from the case page or by forwarding to submit@abjail.org. We extract the details ActBlue needs to investigate and generate a report for you, so you can submit fast and track responses on the case.
      </>
    ),
    icon: (
      <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Why this exists",
    description: (
      <>
        Our goal is accountability. By <strong>centralizing evidence and patterns of deceptive fundraising</strong> – fake matches, contrived deadlines, misleading language – we make it easier to spot abuses, report them to platforms, and track outcomes over time.
      </>
    ),
    icon: (
      <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Privacy & public record",
    description:
      "Submissions are public. We attempt to redact personally identifying information, but accuracy isn't guaranteed – please remove private details before submitting. By contributing, you help document deceptive tactics and make accountability easier for platforms and the public.",
    icon: (
      <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
];

export function OnboardingModal({ open, onOpenChange, videoUrl }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onOpenChange(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset to first step when closing
    setTimeout(() => setCurrentStep(0), 200);
  };

  const step = STEPS[currentStep];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{step.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6" style={{ minHeight: '240px' }}>
          {/* Optional video slot */}
          {videoUrl && currentStep === 0 && (
            <div className="aspect-video rounded-lg overflow-hidden bg-slate-100">
              <video
                src={videoUrl}
                controls
                className="w-full h-full"
                preload="metadata"
              >
                <track kind="captions" />
              </video>
            </div>
          )}

          {/* Icon */}
          {step.icon && (
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                {step.icon}
              </div>
            </div>
          )}

          {/* Description */}
          <DialogDescription className="text-base leading-relaxed text-slate-700 min-h-[100px]">
            {step.description}
          </DialogDescription>

          {/* Step indicators */}
          <div className="flex justify-center gap-2 pt-2">
            {STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStep
                    ? "w-8 bg-slate-900"
                    : "w-2 bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label={`Go to step ${idx + 1}`}
                aria-current={idx === currentStep ? "step" : undefined}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div>
              {currentStep > 0 && (
                <button
                  onClick={handleBack}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/welcome"
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                onClick={() => onOpenChange(false)}
              >
                Full guide
              </Link>
              <button
                onClick={handleNext}
                className="px-6 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
              >
                {currentStep < STEPS.length - 1 ? "Next" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

