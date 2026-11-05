import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sparkles, Infinity as InfinityIcon, Gauge, Crop, Captions, Wand2,
  Link2, BrainCircuit, Download, Clock3, ShieldCheck, Smartphone, Zap,
} from "lucide-react";

export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-1 pt-10 text-center sm:pt-14">
      <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
        <Zap className="h-3.5 w-3.5" /> Free · Unlimited · No sign-up
      </div>
      <h1 className="text-balance text-4xl font-black leading-[1.08] tracking-tight text-zinc-50 sm:text-5xl">
        Any YouTube video.
        <br />
        <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-300 bg-clip-text text-transparent">
          Viral-ready shorts.
        </span>
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
        Paste a link of <strong className="font-semibold text-zinc-200">any length</strong> — AI listens to the whole
        thing, finds the 3–4 best moments, scores their viral potential, reframes them so no face ever gets cut off,
        and burns in karaoke captions. Made on your phone, ready to post.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {[
          { icon: InfinityIcon, t: "No duration limits" },
          { icon: BrainCircuit, t: "AI moment picker" },
          { icon: Gauge, t: "Virality score" },
          { icon: Crop, t: "Smart reframing" },
          { icon: Captions, t: "Auto captions" },
          { icon: Smartphone, t: "Phone friendly" },
        ].map((f) => (
          <span
            key={f.t}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-300"
          >
            <f.icon className="h-3.5 w-3.5 text-emerald-400" /> {f.t}
          </span>
        ))}
      </div>
      <div className="mt-7 flex justify-center">
        <a
          href="#studio"
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-emerald-500 px-7 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/25 transition-colors hover:bg-emerald-400"
        >
          <Sparkles className="h-4 w-4" /> Start clipping — it&apos;s free
        </a>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: InfinityIcon,
    title: "No duration limits",
    body: "5 minutes or 5 hours — the whole video gets analyzed end-to-end. No “max 1 hour” paywalls, no trimming first.",
  },
  {
    icon: BrainCircuit,
    title: "AI finds the best scenes",
    body: "Whisper transcribes every word; the engine scores hooks, questions, emotion, energy peaks and clean sentence boundaries — then picks the 3–4 strongest, non-overlapping moments.",
  },
  {
    icon: Gauge,
    title: "Virality potential score",
    body: "Every clip gets a 0–100 score with a transparent breakdown: Hook, Energy, Pacing and Flow — so you post the winners first.",
  },
  {
    icon: Crop,
    title: "Smart reframing (no cut-off faces)",
    body: "Landscape → vertical without butchering it: faces are detected and tracked, the crop follows the speaker with smooth, editor-style camera moves. Choose 9:16, 1:1, 4:5 or 16:9.",
  },
  {
    icon: Captions,
    title: "Editing-app captions",
    body: "Karaoke-style word highlighting, big bold pop text, burned right into the video. English, Hindi, Urdu and 90+ languages auto-detected.",
  },
  {
    icon: Wand2,
    title: "Posting kit included",
    body: "Each clip ships with a suggested title, hashtag set, loudness-normalized audio and a clean 30 fps export — copy, paste, post.",
  },
];

export function Features() {
  return (
    <section className="mx-auto mt-16 w-full max-w-3xl px-1">
      <h2 className="text-center text-2xl font-bold text-zinc-100 sm:text-3xl">
        Everything a clipping app should do
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title} className="border-zinc-800 bg-zinc-900/50 transition-colors hover:border-emerald-800/60">
            <CardContent className="p-5">
              <div className="mb-3 inline-flex rounded-lg bg-emerald-500/10 p-2.5">
                <f.icon className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-zinc-100">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", icon: Link2, title: "Paste or upload", body: "Drop any YouTube link, or pick a video straight from your phone gallery." },
  { n: "02", icon: Clock3, title: "It listens to everything", body: "The full video is downloaded and transcribed — no matter how long it is." },
  { n: "03", icon: BrainCircuit, title: "AI picks + scores", body: "The strongest 3–4 moments are selected and scored for viral potential." },
  { n: "04", icon: Download, title: "Download & post", body: "Preview each short, grab the file and your hashtags, and upload to Shorts, Reels or TikTok." },
];

export function HowItWorks() {
  return (
    <section className="mx-auto mt-16 w-full max-w-3xl px-1">
      <h2 className="text-center text-2xl font-bold text-zinc-100 sm:text-3xl">Four steps, zero editing</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex flex-col items-center">
              <span className="text-lg font-black text-emerald-400/90">{s.n}</span>
              <div className="mt-2 h-full w-px bg-zinc-800" />
            </div>
            <div>
              <p className="flex items-center gap-2 font-semibold text-zinc-100">
                <s.icon className="h-4 w-4 text-emerald-400" /> {s.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Is it really free and unlimited?",
    a: "Yes. No accounts, no quotas, no watermarks, no hidden Pro tier. Paste a link or upload a video as many times as you want.",
  },
  {
    q: "Does it work on my phone?",
    a: "That's exactly what it's built for. The whole app is a mobile web app — open it in your phone browser, paste a link, download the finished MP4s. Nothing to install.",
  },
  {
    q: "What does the virality score actually mean?",
    a: "It's an estimate (0–100) built from four signals: how strong the opening hook is, how much energy/emotion is in the voice, whether the talking pace suits shorts, and whether the clip starts and ends cleanly. Higher = more likely to hold viewers — but the algorithm gods make no promises.",
  },
  {
    q: "How does it avoid cutting people in half when going vertical?",
    a: "Every clip is reframed with face detection + tracking: the crop window follows the main speaker smoothly across the frame, with motion-based fallback when nobody's face is visible. That's why clips look edited, not center-cropped.",
  },
  {
    q: "Which videos work best?",
    a: "Talking videos: podcasts, interviews, speeches, tutorials, streams. Music-only videos still work — clips are then chosen by audio-energy peaks.",
  },
  {
    q: "A YouTube link failed. Why?",
    a: "YouTube actively blocks cloud servers from time to time (bot checks, rate limits). Wait a couple of minutes and retry — or download/save the video and use the Upload tab, which always works.",
  },
  {
    q: "How long does it take?",
    a: "Roughly 1–4 minutes of processing per 10 minutes of video: download → transcribe → pick → render. A 30-minute podcast is usually ready in about 10 minutes. Keep the page open or come back to it via Recent renders.",
  },
  {
    q: "What languages are supported for captions?",
    a: "Auto-detected: English is most reliable, Hindi and Urdu work well (with Devanagari/Naskh fonts built in), and 90+ more languages are supported by the speech engine. Always give captions a quick preview.",
  },
];

export function Faq() {
  return (
    <section className="mx-auto mt-16 w-full max-w-3xl px-1">
      <h2 className="text-center text-2xl font-bold text-zinc-100 sm:text-3xl">FAQ</h2>
      <Accordion type="single" collapsible className="mt-6 space-y-3">
        {FAQS.map((f, i) => (
          <AccordionItem
            key={i}
            value={`f${i}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4"
          >
            <AccordionTrigger className="py-4 text-left text-sm font-semibold text-zinc-200 hover:text-emerald-300 hover:no-underline">
              {f.q}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm leading-relaxed text-zinc-400">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-zinc-800/80 bg-zinc-950/80 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
      <div className="mx-auto max-w-3xl space-y-2 px-4 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-bold text-zinc-200">
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> ViralCut
        </p>
        <p className="text-xs leading-relaxed text-zinc-500">
          Powered by FFmpeg · Whisper · yt-dlp · OpenCV — running server-side, so your phone stays cool.
          <br />
          Only download and clip videos you have the rights to use. Respect creators. © 2026 ViralCut.
        </p>
      </div>
    </footer>
  );
}
