"use client";

import { Header } from "@/components/homepage/Header";
import { Footer } from "@/components/Footer";

export default function ApiAccessPage() {
  return (
    <div className="flex flex-col min-h-screen" data-theme="v2">
      <Header isHomepage={false} />

      {/* Main Content */}
      <main className="flex-1">
        <section className="py-20 md:py-28 border-b border-border/40 bg-secondary/20">
          <div className="container mx-auto px-6 md:px-12 max-w-6xl">
            <div className="text-center space-y-6">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]" style={{ fontFamily: 'var(--font-playfair), ui-serif, Georgia, serif' }}>
                API Access
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Coming soon...
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
