/**
 * Highlight selection + virality scoring engine.
 *
 * Signals used (all computed locally):
 *  - Whisper transcript with word timestamps (hooks, questions, emotion, pacing)
 *  - RMS loudness curve (shouting, laughter, music drops, excitement)
 *  - Sentence-boundary completeness (clips must feel finished, not chopped)
 */

export interface Word {
  start: number;
  end: number;
  word: string;
}
export interface Segment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}
export interface Transcript {
  language: string;
  duration: number;
  segments: Segment[];
}

export interface HighlightOptions {
  count: number;
  lengthPref: "auto" | "30" | "45" | "60";
}

export interface Highlight {
  start: number;
  end: number;
  duration: number;
  score: number;
  hook: number;
  energy: number;
  pacing: number;
  flow: number;
  reason: string;
  title: string;
  hashtags: string;
  text: string;
}

/* ------------------------------------------------------------------ */
/*  Vocabulary                                                         */
/* ------------------------------------------------------------------ */

const HOOK_WORDS = newSet([
  "how", "why", "what", "when", "secret", "secrets", "truth", "mistake", "mistakes",
  "never", "always", "nobody", "everyone", "best", "worst", "huge", "insane", "crazy",
  "amazing", "shocking", "surprised", "surprising", "actually", "literally",
  "stop", "listen", "imagine", "remember", "warning", "proof", "really",
  "problem", "problems", "hack", "hacks", "trick", "tricks", "tip", "tips",
  "free", "money", "rich", "broke", "fail", "failed", "failure", "win", "won",
  "love", "hate", "fear", "afraid", "dream", "real", "fact", "facts", "read this",
  "changed", "change", "life", "story", "happened", "thousand", "million", "billion",
  "most", "least", "first", "last", "before", "after", "versus", "vs",
]);

const EMOTION_MARKS = /[!?]{1,}|\b(wow|oh my god|omg|haha|laughter|laughs|unbelievable|incredible|no way|let's go|les go)\b/gi;

const STOPWORDS = newSet([
  "the", "a", "an", "and", "or", "but", "if", "then", "so", "because", "as", "of", "at",
  "by", "for", "with", "about", "against", "between", "into", "through", "during", "before",
  "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over",
  "under", "again", "further", "once", "here", "there", "all", "any", "both", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "than",
  "too", "very", "s", "t", "can", "will", "just", "don", "should", "now", "i", "me", "my",
  "we", "our", "you", "your", "he", "him", "his", "she", "her", "it", "its", "they", "them",
  "their", "what", "which", "who", "this", "that", "these", "those", "am", "is", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing",
  "would", "could", "ought", "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd", "she'd", "we'd", "they'd",
  "i'll", "you'll", "he'll", "she'll", "we'll", "they'll", "isn't", "aren't", "wasn't",
  "weren't", "haven't", "hasn't", "hadn't", "doesn't", "don't", "didn't", "won't", "wouldn't",
  "can't", "couldn't", "shouldn't", "gonna", "wanna", "gotta", "yeah", "okay", "ok", "like",
  "right", "one", "two", "uh", "um", "hmm",
]);

function newSet(arr: string[]): Set<string> {
  return new Set(arr.map((w) => w.toLowerCase()));
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normRms(rms: number[]): number[] {
  if (!rms.length) return [];
  const sorted = [...rms].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] || 1e-6;
  const p20 = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const span = Math.max(1e-6, p95 - p20);
  return rms.map((v) => Math.min(1, Math.max(0, (v - p20) / span)));
}

function gauss(x: number, mu: number, sigma: number): number {
  return Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
}

function keywords(text: string, n: number): string[] {
  const freq = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^'\p{L}\p{N}]+/u)) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, n)
    .map(([w]) => w);
}

function titleCase(s: string): string {
  return s.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Main selection                                                     */
/* ------------------------------------------------------------------ */

export interface RmsData {
  step: number;
  rms: number[];
}

export function pickHighlights(
  transcript: Transcript,
  energy: RmsData | null,
  opts: HighlightOptions
): { highlights: Highlight[]; language: string } {
  const { language, duration } = transcript;
  const words: Word[] = transcript.segments.flatMap((s) => s.words);
  const energyNorm = energy ? normRms(energy.rms) : [];

  const energyAt = (t: number): number => {
    if (!energyNorm.length || !energy) return 0.35;
    const i = Math.min(energyNorm.length - 1, Math.max(0, Math.floor(t / energy.step)));
    return energyNorm[i];
  };

  // window lengths we're willing to consider
  const lens: number[] =
    opts.lengthPref === "auto"
      ? [30, 40, 50, 58].filter((L) => L <= Math.max(15, duration - 2))
      : [Number(opts.lengthPref)];
  if (!lens.length) lens.push(Math.max(12, Math.min(58, duration - 2)));

  const maxCount = Math.max(
    1,
    Math.min(opts.count, Math.floor((duration - 8) / 20) || 1)
  );

  // no speech at all → energy-only windows
  if (words.length < 8) {
    return { highlights: energyOnlyWindows(duration, lens, maxCount, energyNorm, energy?.step ?? 1), language };
  }

  const stepT = duration > 2700 ? 2.5 : 1.0; // bound work on 45min+ videos
  const segStarts = transcript.segments.map((s) => s.start);
  const segEnds = transcript.segments.map((s) => s.end);

  type Cand = Highlight;
  const cands: Cand[] = [];

  for (const L of lens) {
    for (let t0 = 0; t0 + L <= duration + 0.5; t0 += stepT) {
      const t1 = Math.min(duration, t0 + L);
      const inWin = words.filter((w) => w.end > t0 && w.start < t1);
      if (inWin.length < 6) continue;

      const wps = inWin.length / (t1 - t0);
      // hook: first 5 seconds
      const opening = inWin.filter((w) => w.start < t0 + 5);
      let hookHits = 0;
      for (const w of opening) {
        const clean = w.word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
        if (HOOK_WORDS.has(clean)) hookHits++;
      }
      const openingText = opening.map((w) => w.word).join("");
      const qMark = /\?/.test(openingText) ? 0.35 : 0;
      const hook = Math.min(1, hookHits / 2.2 + qMark);

      // energy weighted toward the opening
      let eSum = 0;
      let eW = 0;
      for (let t = t0; t < t1; t += 1) {
        const w = t < t0 + 10 ? 1.6 : 1.0;
        eSum += energyAt(t) * w;
        eW += w;
      }
      const energyScore = Math.min(1, eSum / Math.max(1e-6, eW));

      // pacing: sweet spot ~2.2-3.8 words/sec
      const pacing = gauss(wps, 3.0, 1.05);

      // flow: starts at sentence start, ends at sentence end
      const startDist = Math.min(...segStarts.map((s) => Math.abs(s - t0)));
      const endDist = Math.min(...segEnds.map((s) => Math.abs(s - t1)));
      const flow = 0.55 * (1 - Math.min(1, startDist / 1.6)) + 0.45 * (1 - Math.min(1, endDist / 2.2));

      // emotion marks inside window
      const winText = inWin.map((w) => w.word).join(" ");
      const emo = Math.min(1, (winText.match(EMOTION_MARKS) ?? []).length / 3);

      const total =
        0.34 * hook + 0.24 * (0.6 * energyScore + 0.4 * emo) + 0.2 * pacing + 0.22 * flow;

      cands.push({
        start: t0,
        end: t1,
        duration: t1 - t0,
        score: 0,
        hook: 0, energy: 0, pacing: 0, flow: 0,
        reason: "",
        title: "",
        hashtags: "",
        text: "",
        // temp store
        ...({ _raw: total, _hook: hook, _energy: energyScore, _emo: emo, _pacing: pacing, _flow: flow } as object),
      });
    }
  }

  if (!cands.length) {
    return { highlights: energyOnlyWindows(duration, lens, maxCount, energyNorm, energy?.step ?? 1), language };
  }

  // greedy pick with spatial diversity penalty
  const picked: Cand[] = [];
  const pool = [...cands];
  while (picked.length < maxCount && pool.length) {
    pool.sort((a, b) => (b as unknown as { _raw: number })._raw - (a as unknown as { _raw: number })._raw);
    const best = pool.shift()!;
    const bestRaw = (best as unknown as { _raw: number })._raw;
    // quality floor: never pad the list with weak leftovers — fewer, better clips
    if (picked.length > 0 && bestRaw < 0.3) break;
    picked.push(best);
    // penalize neighbors of the pick so clips spread across the video
    const zone = Math.max(25, duration * 0.08);
    for (let i = pool.length - 1; i >= 0; i--) {
      const c = pool[i] as unknown as { _raw: number };
      const mid = ((c.start ?? 0) + (c.end ?? 0)) / 2;
      const bmid = (best.start + best.end) / 2;
      if (Math.abs(mid - bmid) < zone) {
        c._raw *= 0.55;
        if (c._raw < 0.05) pool.splice(i, 1);
      }
      // hard reject overlaps
      if ((c.start ?? 0) < best.end + 3 && (c.end ?? 0) > best.start - 3) pool.splice(i, 1);
    }
  }

  const highlights = picked
    .sort((a, b) => a.start - b.start)
    .map((c) => {
      const r = c as unknown as {
        _raw: number; _hook: number; _energy: number; _emo: number; _pacing: number; _flow: number;
      };
      const score = Math.round(38 + Math.min(1, Math.max(0, r._raw)) * 59);
      const winWords = words.filter((w) => w.end > c.start && w.start < c.end);
      const text = winWords.map((w) => w.word).join("").replace(/\s+/g, " ").trim();
      const kws = keywords(text, 6);
      const reason = buildReason(r._hook, r._energy, r._emo, r._pacing, r._flow, kws);
      const title = buildTitle(r._hook, kws, text);
      const hashtags = buildHashtags(kws);
      return {
        start: round2(c.start),
        end: round2(c.end),
        duration: round2(c.end - c.start),
        score,
        hook: to100(r._hook),
        energy: to100(0.6 * r._energy + 0.4 * r._emo),
        pacing: to100(r._pacing),
        flow: to100(r._flow),
        reason,
        title,
        hashtags,
        text: text.length > 600 ? text.slice(0, 600) + "…" : text,
      } satisfies Highlight;
    });

  return { highlights, language };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function to100(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100);
}

function buildReason(
  hook: number, energy: number, emo: number, pacing: number, flow: number, kws: string[]
): string {
  const bits: string[] = [];
  if (hook > 0.45) bits.push("strong verbal hook in the first seconds");
  else if (flow > 0.7) bits.push("clean start and finish");
  if (energy > 0.55 || emo > 0.4) bits.push("high energy / emotional spike");
  if (pacing > 0.72) bits.push("great talking pace for shorts");
  if (flow > 0.75) bits.push("ends on a complete thought");
  if (!bits.length) bits.push("solid self-contained moment");
  const kw = kws.slice(0, 3).join(", ");
  return `${bits.join(", ")}${kw ? ` — topics: ${kw}` : ""}`;
}

function buildTitle(hook: number, kws: string[], text: string): string {
  const k = kws.slice(0, 2).map(titleCase);
  if (k.length >= 2) return `${k[0]} × ${k[1]} — ${hook > 0.4 ? "You Need To Hear This" : "The Part Everyone Rewatches"}`;
  if (k.length === 1) return `${k[0]}: The Moment That Matters`;
  return "The Moment Everyone Rewatches";
}

function buildHashtags(kws: string[]): string {
  const base = kws.slice(0, 3).map((w) => "#" + w.replace(/[^\p{L}\p{N}]/gu, ""));
  return [...base, "#shorts", "#reels", "#viral", "#fyp"].slice(0, 7).join(" ");
}

/** Fallback for videos with no usable speech: pick high-energy windows. */
function energyOnlyWindows(
  duration: number,
  lens: number[],
  count: number,
  energyNorm: number[],
  step: number
): Highlight[] {
  const L = lens[0] ?? Math.min(30, duration);
  const eAt = (t: number) => energyNorm.length ? energyNorm[Math.min(energyNorm.length - 1, Math.floor(t / step))] : 0.4;
  const wins: { t0: number; s: number }[] = [];
  for (let t0 = 0; t0 + L <= duration + 0.5; t0 += Math.max(1, duration > 2700 ? 2.5 : 1)) {
    let s = 0;
    for (let t = t0; t < Math.min(duration, t0 + L); t += 1) s += eAt(t);
    wins.push({ t0, s });
  }
  wins.sort((a, b) => b.s - a.s);
  const picked: { t0: number; s: number }[] = [];
  for (const w of wins) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.abs(p.t0 - w.t0) > L + 4)) picked.push(w);
  }
  return picked
    .sort((a, b) => a.t0 - b.t0)
    .map((p) => {
      const score = Math.round(45 + Math.min(1, p.s / L) * 45);
      return {
        start: round2(p.t0),
        end: round2(p.t0 + L),
        duration: round2(L),
        score,
        hook: 50, energy: to100(p.s / L), pacing: 55, flow: 55,
        reason: "picked by audio-energy peaks (music / action / crowd moments)",
        title: "High-Energy Moment",
        hashtags: "#shorts #reels #viral #fyp",
        text: "",
      } satisfies Highlight;
    });
}
