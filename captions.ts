import type { Word } from "./highlights";

/**
 * Builds a karaoke-style .ass subtitle file: chunked "pop" captions where the
 * currently-spoken word lights up — the look of CapCut / OpusClip captions.
 */

interface Chunk {
  start: number;
  end: number;
  words: Array<{ w: string; s: number; e: number }>;
}

const LATIN_UPPER = /[\p{Lu}\p{Ll}]/u;

function scriptOf(text: string): "deva" | "arab" | "latin" {
  if (/[\u0900-\u097F]/.test(text)) return "deva";
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return "arab";
  return "latin";
}

function assTime(t: number): string {
  const clamped = Math.max(0, t);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  const cs2 = cs === 100 ? 99 : cs;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs2).padStart(2, "0")}`;
}

function bgr(hex: string): string {
  // "#RRGGBB" -> ASS &HAABBGGRR
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function buildChunks(words: Word[], clipStart: number, clipEnd: number): Chunk[] {
  const inClip = words.filter((w) => w.end > clipStart && w.start < clipEnd);
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;

  for (const w of inClip) {
    const clean = w.word.trim();
    if (!clean) continue;
    const s = Math.max(w.start - clipStart, 0);
    const e = Math.min(w.end - clipStart, clipEnd - clipStart);
    if (e <= s && e === 0) continue;
    const startsNew =
      !cur ||
      cur.words.length >= 4 ||
      e - cur.start > 1.8 ||
      /[.!?…]$/.test(cur.words[cur.words.length - 1].w);

    if (startsNew) {
      if (cur && cur.words.length) chunks.push(cur);
      cur = { start: s, end: e, words: [{ w: clean, s, e }] };
    } else if (cur) {
      cur.words.push({ w: clean, s, e });
      cur.end = e;
    }
  }
  if (cur && cur.words.length) chunks.push(cur);
  return chunks;
}

function escapeAss(t: string): string {
  return t.replace(/[{}]/g, "").replace(/\\/g, "").trim();
}

export interface AssOptions {
  width: number;
  height: number;
  accentHex?: string; // highlight color for the spoken word
}

export function buildAss(
  words: Word[],
  clipStart: number,
  clipEnd: number,
  opts: AssOptions
): string {
  const { width: W, height: H } = opts;
  const accent = bgr(opts.accentHex ?? "#FFC526");
  const white = bgr("#FFFFFF");
  const outline = "&H00000000";
  const shadow = "&HA0000000";
  const fontSize = Math.round(H * 0.052);
  const outlineW = Math.max(3, Math.round(H * 0.008));
  const posY = Math.round(H * (W / H < 1 ? 0.72 : 0.78));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Pop,Noto Sans,${fontSize},${accent},${white},${outline},${shadow},1,0,0,0,100,100,0,0,1,${outlineW},1,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const chunks = buildChunks(words, clipStart, clipEnd);
  const lines: string[] = [];

  for (const c of chunks) {
    const script = scriptOf(c.words.map((x) => x.w).join(" "));
    const fontTag =
      script === "deva" ? "{\\fnNoto Sans Devanagari}" : script === "arab" ? "{\\fnNoto Naskh Arabic}" : "";
    const upper = script === "latin";

    // karaoke durations (centiseconds), stretch the last word to chunk end
    const durTotal = Math.max(1, Math.round((c.end - c.start) * 100));
    let used = 0;
    const ks = c.words.map((x, i) => {
      const raw =
        i === c.words.length - 1
          ? durTotal - used
          : Math.round((x.e - x.s) * 100);
      used += Math.max(1, raw);
      return Math.max(1, raw);
    });

    const body = c.words
      .map((x, i) => {
        let w = escapeAss(x.w);
        if (upper && LATIN_UPPER.test(w)) w = w.toUpperCase();
        return `{\\k${ks[i]}}${w}`;
      })
      .join(" ");

    // shrink font if the line is likely too wide (rough estimate)
    const rawText = c.words.map((x) => x.w).join(" ");
    const estChars = upper ? rawText.length : rawText.length * 0.8;
    const estWidth = estChars * fontSize * 0.56;
    const scale = estWidth > W * 0.88 ? Math.max(0.62, (W * 0.88) / estWidth) : 1;
    const fsTag = scale < 1 ? `{\\fs${Math.round(fontSize * scale)}}` : "";

    const anim = "{\\an5\\fscx84\\fscy84\\t(0,110,\\fscx100\\fscy100)}";
    const pos = `{\\pos(${Math.round(W / 2)},${posY})}`;
    lines.push(
      `Dialogue: 0,${assTime(c.start)},${assTime(c.end + 0.1)},Pop,,0,0,0,,${fontTag}${fsTag}${anim}${pos}${body}`
    );
  }

  return header + lines.join("\n") + "\n";
}
