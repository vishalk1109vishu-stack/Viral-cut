import { mkdir } from "fs/promises";
import path from "path";
import { run } from "./util";
import { buildAss } from "./captions";
import type { Word } from "./highlights";

export const RATIOS: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "16:9": { w: 1920, h: 1080 },
};

export interface FaceSample {
  t: number;
  cx: number;
  cy: number;
  face?: boolean;
}

interface CropPlan {
  cropW: number;
  cropH: number;
  axis: "x" | "y" | null;
  cmds: string | null;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Turn face/motion samples into a smooth crop path.
 * EMA smoothing + deadband + smoothstep easing = steady, human-feeling camera.
 */
export function buildCropPlan(
  samples: FaceSample[],
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  clipStart: number,
  clipEnd: number
): CropPlan {
  const srcAR = srcW / srcH;
  const targetAR = targetW / targetH;

  if (Math.abs(srcAR - targetAR) < 0.02) {
    return { cropW: even(srcW), cropH: even(srcH), axis: null, cmds: null };
  }

  const horizontalCrop = srcAR > targetAR;
  const cropW = horizontalCrop ? even(srcH * targetAR) : even(srcW);
  const cropH = horizontalCrop ? even(srcH) : even(srcW / targetAR);
  const axis: "x" | "y" = horizontalCrop ? "x" : "y";
  const maxPos = horizontalCrop ? srcW - cropW : srcH - cropH;

  // relevant samples (carry edges outward)
  const rel = samples.filter((s) => s.t >= clipStart - 4 && s.t <= clipEnd + 4);
  const pts =
    rel.length >= 2
      ? rel
      : samples.length
        ? samples.slice(0, 1).concat(samples.slice(-1))
        : [{ t: clipStart, cx: 0.5, cy: 0.5 }, { t: clipEnd, cx: 0.5, cy: 0.5 }];

  // EMA smoothing (in normalized coords) — responsive enough to track motion,
  // smooth enough to feel like a human camera operator
  const alpha = 0.5;
  const deadband = 0.006;
  const smoothed: Array<{ t: number; v: number }> = [];
  let acc = horizontalCrop ? pts[0].cx : pts[0].cy;
  for (const p of pts) {
    const raw = horizontalCrop ? p.cx : p.cy;
    const next = Math.abs(raw - acc) < deadband ? acc : acc + alpha * (raw - acc);
    acc = next;
    smoothed.push({ t: p.t, v: next });
  }

  // eased steps every 0.25 s on the clip-relative timeline
  const lines: string[] = [];
  const stepDur = 0.25;
  let lastPos = -1;
  const posAt = (t: number): number => {
    // find bracketing smoothed samples
    let i = 0;
    while (i < smoothed.length - 1 && smoothed[i + 1].t < t) i++;
    const a = smoothed[i];
    const b = smoothed[Math.min(i + 1, smoothed.length - 1)];
    const span = Math.max(1e-6, b.t - a.t);
    let u = Math.min(1, Math.max(0, (t - a.t) / span));
    u = u * u * (3 - 2 * u); // smoothstep
    const v = a.v + (b.v - a.v) * u;
    const raw = horizontalCrop ? v * srcW - cropW / 2 : v * srcH - cropH / 2;
    return Math.min(maxPos, Math.max(0, raw));
  };

  for (let t = 0; t <= clipEnd - clipStart + 0.2; t += stepDur) {
    const p = Math.round(posAt(t + clipStart));
    if (p !== lastPos) {
      lines.push(`${t.toFixed(2)} crop ${axis} ${p};`);
      lastPos = p;
    }
  }

  return { cropW, cropH, axis, cmds: lines.length ? lines.join("\n") : null };
}

export interface RenderClipArgs {
  src: string;
  out: string;
  assPath: string | null;
  start: number;
  duration: number;
  srcW: number;
  srcH: number;
  targetW: number;
  targetH: number;
  samples: FaceSample[];
  hasAudio: boolean;
  onPct?: (pct: number) => void;
}

/** Cut + reframe + burn captions + loudness-normalize, in one ffmpeg pass. */
export async function renderClip(args: RenderClipArgs): Promise<void> {
  await mkdir(path.dirname(args.out), { recursive: true });

  const plan = buildCropPlan(
    args.samples,
    args.srcW,
    args.srcH,
    args.targetW,
    args.targetH,
    args.start,
    args.start + args.duration
  );

  const filters: string[] = [];
  const tmpCmds = `/tmp/sendcmd-${process.pid}-${Math.random().toString(36).slice(2)}.cmd`;

  if (plan.axis && plan.cmds) {
    const { writeFile } = await import("fs/promises");
    await writeFile(tmpCmds, plan.cmds, "utf8");
    filters.push(
      `sendcmd=f=${tmpCmds}`,
      `crop=w=${plan.cropW}:h=${plan.cropH}:x=0:y=0`
    );
    // crop filter with dynamic x needs initial x/y matching axis
  } else if (plan.axis === null && (Math.abs(args.srcW / args.srcH - args.targetW / args.targetH) >= 0.02)) {
    // unreachable, kept for safety
  }

  filters.push(
    `scale=${args.targetW}:${args.targetH}:flags=lanczos`,
    "setsar=1",
    "fps=30"
  );
  if (args.assPath) {
    filters.push(
      `subtitles=filename=${args.assPath}:fontsdir=/home/z/.fonts:alpha=0`
    );
  }

  const af = ["loudnorm=I=-14:TP=-1.5:LRA=11"];

  const ffArgs = [
    "-hide_banner", "-loglevel", "error", "-nostats", "-y",
    "-progress", "pipe:1",
    "-ss", args.start.toFixed(3),
    "-i", args.src,
    "-t", args.duration.toFixed(3),
    "-vf", filters.join(","),
    ...(args.hasAudio ? ["-af", af.join(",")] : ["-an"]),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    "-movflags", "+faststart",
    args.out,
  ];

  const res = await run("ffmpeg", ffArgs, {
    timeoutMs: 60 * 60_000,
    onLine: (line) => {
      if (line.startsWith("out_time_ms=") && args.onPct) {
        const ms = Number(line.slice("out_time_ms=".length));
        if (Number.isFinite(ms) && ms > 0) {
          args.onPct(Math.min(99.5, (ms / 1_000_000 / args.duration) * 100));
        }
      }
    },
  });

  // dynamic-x crop needs the initial x to be valid too — re-run with static start if first attempt failed
  if (res.code !== 0 && plan.axis && plan.cmds) {
    const firstPos = Number(plan.cmds.split("\n")[0].split(" ")[3]);
    const xExpr = plan.axis === "x" ? String(firstPos) : "0";
    const yExpr = plan.axis === "y" ? String(firstPos) : "0";
    const retryFilters = filters.map((f) =>
      f.startsWith("crop=")
        ? `crop=w=${plan.cropW}:h=${plan.cropH}:x=${xExpr}:y=${yExpr}`
        : f
    );
    const ffArgs2 = ffArgs.slice();
    const vfIdx = ffArgs2.indexOf("-vf");
    ffArgs2[vfIdx + 1] = retryFilters.join(",");
    const res2 = await run("ffmpeg", ffArgs2, { timeoutMs: 60 * 60_000 });
    if (res2.code !== 0) {
      throw new Error(`Render failed: ${res2.stderr.slice(-400) || res.stderr.slice(-400)}`);
    }
  } else if (res.code !== 0) {
    throw new Error(`Render failed: ${res.stderr.slice(-400)}`);
  }
}

/** Write the ASS file for a clip and return its path (or null if captions off). */
export async function writeAssFile(
  dir: string,
  name: string,
  words: Word[],
  clipStart: number,
  clipEnd: number,
  targetW: number,
  targetH: number
): Promise<string | null> {
  const ass = buildAss(words, clipStart, clipEnd, { width: targetW, height: targetH });
  const p = path.join(dir, name);
  const { writeFile } = await import("fs/promises");
  await writeFile(p, ass, "utf8");
  return p;
}
