"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

interface FooterProps {
  onScrollToSubmission?: () => void;
}

export function Footer({ onScrollToSubmission }: FooterProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isHomepage = pathname === "/";

  const handleSubmitEvidenceClick = () => {
    if (isHomepage) {
      // On homepage, just scroll to dropzone
      onScrollToSubmission?.();
    } else {
      // On other pages, navigate to home with scroll parameter
      router.push("/?scroll=submission");
    }
  };

  return (
    <footer className="border-t border-border py-12 md:py-16 bg-background">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between gap-12">
          <div className="space-y-4 max-w-sm">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.webp"
                alt="AB Jail logo"
                width={32}
                height={32}
                className="w-8 h-8 rounded-md"
              />
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-foreground">AB Jail</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                  Beta
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              An open-source initiative for political transparency. Not affiliated with ActBlue, official campaigns,
              or any PACs.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-8 md:gap-14">
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-foreground">Platform</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <button onClick={handleSubmitEvidenceClick} className="hover:text-foreground transition-colors text-left">
                    Submit Evidence
                  </button>
                </li>
                <li>
                  <Link href="/cases" className="hover:text-foreground transition-colors">
                    Browse Cases
                  </Link>
                </li>
                <li>
                  <Link href="/stats" className="hover:text-foreground transition-colors">
                    Statistics
                  </Link>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-foreground">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/welcome" className="hover:text-foreground transition-colors">
                    How it Works
                  </Link>
                </li>
                <li>
                  <Link href="/about#terms" className="hover:text-foreground transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-foreground transition-colors">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
            <div className="space-y-4 pt-8 md:pt-0">
              <h4 className="font-medium text-sm text-foreground">Connect</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="https://github.com/ryanmio/ActBlue-Jail" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                    GitHub
                  </a>
                </li>
                <li>
                  <Link href="/api-access" className="hover:text-foreground transition-colors">
                    API Access
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-foreground transition-colors">
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center text-xs text-muted-foreground gap-4">
            <p>© 2025 AB Jail Initiative. Open Source (MIT).</p>
            <p>Built for transparency.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

