import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { run, clamp } from "./util";
import { probe, extractAudio, makeProxy, grabPoster } from "./media";
import { probeYouTube, downloadYouTube } from "./ytdlp";
import { pickHighlights, type Transcript, type FaceSample } from "./highlights";
import { renderClip, writeAssFile, RATIOS } from "./render";

export const JOBS_ROOT = process.env.STORAGE_DIR ? `${process.env.STORAGE_DIR}/jobs` : "/home/z/my-project/storage/jobs";

export function jobDir(jobId: string): string {
  return path.join(JOBS_ROOT, jobId);
}

/* ------------------------------------------------------------------ */
/*  Job queue (one heavy job at a time; survives dev-server HMR)       */
/* ------------------------------------------------------------------ */

type Runner = (jobId: string) => Promise<void>;

const g = globalThis as unknown as {
  __vc_chain?: Promise<void>;
  __vc_current?: string;
};

export function currentJobId(): string | undefined {
  return g.__vc_current;
}

export function enqueueJob(jobId: string): void {
  // NOTE: always reference the freshest `processJob` from module scope —
  // never cache the function itself on globalThis (HMR would freeze old code).
  void (async () => {
    g.__vc_chain = (g.__vc_chain ?? Promise.resolve()).then(
      () => processJob(jobId),
      () => processJob(jobId)
    );
  })();
}

/* ------------------------------------------------------------------ */
/*  Progress helper                                                    */
/* ------------------------------------------------------------------ */

class Progress {
  constructor(private jobId: string) {}
  async set(stage: string, progress: number): Promise<void> {
    await db.job.update({
      where: { id: this.jobId },
      data: {
        stage,
        progress: Math.round(clamp(progress, 0, 100)),
        updatedAt: new Date(),
      },
    }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/*  The pipeline                                                       */
/* ------------------------------------------------------------------ */

export async function processJob(jobId: string): Promise<void> {
  g.__vc_current = jobId;
  const p = new Progress(jobId);
  const dir = jobDir(jobId);
  try {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) return;
    await db.job.update({
      where: { id: jobId },
      data: { status: "working", stage: "Starting", progress: 2, error: null },
    });
    await mkdir(dir, { recursive: true });

    const src = path.join(dir, "source.mp4");
    let title = job.title ?? "";
    let duration = 0;

    /* -------- 1. acquire source ------------------------------------ */
    if (job.source === "youtube" && job.url) {
      await p.set("Reading video info", 4);
      const meta = await probeYouTube(job.url);
      title = meta.title;
      duration = meta.duration;
      await db.job.update({
        where: { id: jobId },
        data: { title, duration: duration || null },
      });
      await p.set("Downloading video", 6);
      await downloadYouTube(job.url, src, (pct) => {
        void p.set("Downloading video", 6 + pct * 0.32);
      });
    } else {
      // upload: file was saved by the API route
      title = title || "Your video";
    }

    await p.set("Inspecting media", 39);
    const info = await probe(src);
    duration = info.duration;
    if (duration < 8) {
      throw new Error("This video is too short to clip (needs at least ~8 seconds).");
    }
    await db.job.update({
      where: { id: jobId },
      data: { duration, title: title || "Your video" },
    });

    /* -------- 2. listen --------------------------------------------- */
    await p.set("Extracting audio", 40);
    const wav = path.join(dir, "audio.wav");
    await extractAudio(src, wav);

    await p.set("Measuring energy", 43);
    const energyPath = path.join(dir, "energy.json");
    await run("python3", [
      `${process.env.AI_SCRIPTS_DIR ?? "/home/z/my-project/ai-scripts"}/energy.py`,
      "--wav", wav,
      "--out", energyPath,
      "--step", "0.5",
    ], { timeoutMs: 10 * 60_000 });
    const energy = JSON.parse(
      await (await import("fs/promises")).readFile(energyPath, "utf8")
    ) as { step: number; rms: number[] };

    /* -------- 3. transcribe ------------------------------------------ */
    await p.set("Transcribing speech (AI)", 45);
    const transcriptPath = path.join(dir, "transcript.json");
    const model = duration <= 15 * 60 ? "base" : "tiny";
    const trRes = await run("python3", [
      `${process.env.AI_SCRIPTS_DIR ?? "/home/z/my-project/ai-scripts"}/transcribe.py`,
      "--audio", wav,
      "--out", transcriptPath,
      "--model", model,
      "--models-dir", `${process.env.STORAGE_DIR ?? "/home/z/my-project/storage"}/models`,
    ], {
      timeoutMs: 3 * 3600_000,
      onLine: (line) => {
        const m = line.match(/^PROGRESS\s+([\d.]+)/);
        if (m) void p.set("Transcribing speech (AI)", 45 + parseFloat(m[1]) * 0.13);
      },
    });
    if (trRes.code !== 0) {
      throw new Error("Speech transcription failed on this file (no usable audio?).");
    }
    const transcript = JSON.parse(
      await (await import("fs/promises")).readFile(transcriptPath, "utf8")
    ) as Transcript;
    await db.job.update({
      where: { id: jobId },
      data: { language: transcript.language },
    });

    /* -------- 4. choose the best moments ----------------------------- */
    await p.set("Finding the best moments", 59);
    const { highlights } = pickHighlights(
      transcript,
      energy,
      { count: job.clipCount, lengthPref: job.clipLength as "auto" | "30" | "45" | "60" }
    );
    if (!highlights.length) {
      throw new Error("Could not find any highlight-worthy moments in this video.");
    }

    const target = RATIOS[job.ratio] ?? RATIOS["9:16"];
    const wordsFlat = transcript.segments.flatMap((s) => s.words);

    // clip rows first so the UI can show them as they render
    const clipRows = [] as Array<{ id: string; index: number; h: (typeof highlights)[number] }>;
    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      const row = await db.clip.create({
        data: {
          jobId,
          index: i + 1,
          start: h.start,
          end: h.end,
          duration: h.duration,
          score: h.score,
          hook: h.hook,
          energy: h.energy,
          pacing: h.pacing,
          flow: h.flow,
          reason: h.reason,
          title: h.title,
          hashtags: h.hashtags,
          text: h.text,
        },
      });
      clipRows.push({ id: row.id, index: i + 1, h });
    }

    /* -------- 5. subject tracking ------------------------------------ */
    await p.set("Tracking the subject", 62);
    let samples: FaceSample[] = [];
    try {
      const proxyPath = path.join(dir, "proxy.mp4");
      await makeProxy(src, proxyPath);
      const facesPath = path.join(dir, "faces.json");
      const fRes = await run("python3", [
        `${process.env.AI_SCRIPTS_DIR ?? "/home/z/my-project/ai-scripts"}/track_faces.py`,
        "--proxy", proxyPath,
        "--fps", "2",
        "--out", facesPath,
      ], { timeoutMs: 2 * 3600_000 });
      if (fRes.code === 0) {
        const faces = JSON.parse(
          await (await import("fs/promises")).readFile(facesPath, "utf8")
        ) as { samples: FaceSample[] };
        samples = faces.samples;
      }
    } catch {
      // tracking is an enhancement — fall back to centered crops
      samples = [];
    }

    /* -------- 6. render clips ---------------------------------------- */
    const renderStart = 66;
    const per = (100 - renderStart) / clipRows.length;
    for (let i = 0; i < clipRows.length; i++) {
      const { id, index, h } = clipRows[i];
      const base = renderStart + i * per;
      await p.set(`Rendering clip ${index} of ${clipRows.length}`, base);
      const outName = `clip-${index}.mp4`;
      const outPath = path.join(dir, outName);

      let assPath: string | null = null;
      if (job.captions) {
        assPath = (await writeAssFile(
          dir,
          `clip-${index}.ass`,
          wordsFlat,
          h.start,
          h.end,
          target.w,
          target.h
        )) as string | null;
      }

      await renderClip({
        src,
        out: outPath,
        assPath,
        start: h.start,
        duration: Math.min(h.duration, Math.max(3, duration - h.start)),
        srcW: info.width,
        srcH: info.height,
        targetW: target.w,
        targetH: target.h,
        samples,
        hasAudio: info.hasAudio,
        onPct: (pct) => void p.set(`Rendering clip ${index} of ${clipRows.length}`, base + (pct / 100) * per),
      });

      const posterPath = path.join(dir, `poster-${index}.jpg`);
      await grabPoster(src, h.start + Math.min(3, h.duration / 2), posterPath).catch(() => undefined);

      await db.clip.update({
        where: { id },
        data: { file: outName, poster: `poster-${index}.jpg` },
      }).catch(() => undefined);
    }

    await db.job.update({
      where: { id: jobId },
      data: { status: "done", stage: "Done", progress: 100 },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong.";
    await db.job.update({
      where: { id: jobId },
      data: { status: "error", stage: "Failed", error: msg.slice(0, 500) },
    }).catch(() => undefined);
  } finally {
    g.__vc_current = undefined;
  }
}

/** Save an uploaded file to the job dir (streamed in chunks by the route). */
export async function saveUpload(jobId: string, fileName: string, data: ArrayBuffer): Promise<void> {
  const dir = jobDir(jobId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "source.mp4"), Buffer.from(data));
  void fileName;
}
