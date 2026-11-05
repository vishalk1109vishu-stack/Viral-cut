import Studio from "@/components/viralcut/studio";
import { Hero, Features, HowItWorks, Faq, Footer } from "@/components/viralcut/marketing";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
            </div>
            <span className="text-lg font-black tracking-tight">
              Viral<span className="text-emerald-400">Cut</span>
            </span>
          </div>
          <a
            href="#studio"
            className="rounded-lg bg-emerald-500/15 px-3.5 py-1.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25"
          >
            Open studio
          </a>
        </div>
      </header>

      <main className="w-full px-4 pb-16">
        <Hero />
        <div className="mt-10">
          <Studio />
        </div>
        <Features />
        <HowItWorks />
        <Faq />
      </main>

      <Footer />
    </div>
  );
}
