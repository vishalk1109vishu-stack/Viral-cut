import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { mkdir, rm, stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { db } from "@/lib/db";
import { enqueueJob, jobDir } from "@/lib/pipeline/runner";
import { isYouTubeUrl, looksLikePlaylist } from "@/lib/pipeline/ytdlp";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET /api/jobs — recent jobs (for the "Recent" shelf). */
export async function GET() {
  const jobs = await db.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { clips: { orderBy: { index: "asc" } } },
  });
  return NextResponse.json({ jobs: jobs.map(serializeJob) });
}

/**
 * Stream an uploaded body to the job dir. Never buffers the file in RAM, so
 * multi-GB phone videos are fine; a client disconnect cleans up after itself.
 */
async function streamUploadTo(jobId: string, body: ReadableStream): Promise<void> {
  const dir = jobDir(jobId);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, "source.mp4");
  const ws = createWriteStream(dest);
  try {
    await pipeline(Readable.fromWeb(body as never), ws);
    const st = await stat(dest);
    if (st.size < 20_000) throw new Error("EMPTY_UPLOAD");
  } catch (err) {
    ws.destroy();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    await db.job.delete({ where: { id: jobId } }).catch(() => undefined);
    const msg = String(err ?? "");
    if (msg.includes("EMPTY_UPLOAD")) {
      throw new Error("Upload failed — the file looks empty. Please retry.");
    }
    if (
      (err as Error)?.name === "AbortError" ||
      msg.includes("closed") ||
      msg.includes("aborted") ||
      msg.includes("premature close")
    ) {
      throw new Error("Upload was interrupted — please try again.");
    }
    throw err;
  }
}

/** POST /api/jobs — create a job from a YouTube link OR an uploaded file. */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    let ratio = "9:16";
    let clipCount = 4;
    let clipLength = "auto";
    let captions = true;
    let job: { id: string } | null = null;
    let source: "youtube" | "upload" = "youtube";
    let url: string | null = null;
    let title: string | null = null;

    if (contentType.startsWith("video/") || contentType === "application/octet-stream") {
      // Raw-stream upload: options ride in the query string, the body is the
      // file itself. Streams straight to disk so even multi-GB phone videos
      // never buffer in RAM.
      const sp = req.nextUrl.searchParams;
      ratio = String(sp.get("ratio") ?? "9:16");
      clipCount = Number(sp.get("clipCount") ?? 4);
      clipLength = String(sp.get("clipLength") ?? "auto");
      captions = String(sp.get("captions") ?? "true") !== "false";
      title = (sp.get("name") ?? "Your video")
        .replace(/\.[^.]+$/, "")
        .slice(0, 120) || "Your video";

      if (!req.body) {
        return NextResponse.json({ error: "No video file received." }, { status: 400 });
      }

      source = "upload";
      job = await db.job.create({
        data: { source, url: null, title, ratio, clipCount, clipLength, captions, status: "queued", stage: "Queued" },
        select: { id: true },
      });

      await streamUploadTo(job.id, req.body);
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      ratio = String(form.get("ratio") ?? "9:16");
      clipCount = Number(form.get("clipCount") ?? 4);
      clipLength = String(form.get("clipLength") ?? "auto");
      captions = String(form.get("captions") ?? "true") !== "false";
      const file = form.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No video file received." }, { status: 400 });
      }
      if (file.size < 20_000) {
        return NextResponse.json({ error: "That file looks empty or corrupted." }, { status: 400 });
      }
      source = "upload";
      title = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Your video";

      job = await db.job.create({
        data: { source, url: null, title, ratio, clipCount, clipLength, captions, status: "queued", stage: "Queued" },
        select: { id: true },
      });

      await streamUploadTo(job.id, file.stream() as unknown as ReadableStream);
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      url = String(body.url ?? "").trim();
      ratio = String(body.ratio ?? "9:16");
      clipCount = Number(body.clipCount ?? 4);
      clipLength = String(body.clipLength ?? "auto");
      captions = body.captions !== false;

      if (!isYouTubeUrl(url)) {
        return NextResponse.json(
          { error: "Paste a valid YouTube video link (watch, youtu.be or Shorts URL)." },
          { status: 400 }
        );
      }
      if (looksLikePlaylist(url)) {
        return NextResponse.json(
          { error: "That link points to a playlist or channel. Open an individual video and paste that link." },
          { status: 400 }
        );
      }
      source = "youtube";
      job = await db.job.create({
        data: { source, url, ratio, clipCount, clipLength, captions, status: "queued", stage: "Queued" },
        select: { id: true },
      });
    }

    if (!RATIOS_OK.has(ratio)) ratio = "9:16";
    if (![3, 4].includes(clipCount)) clipCount = 4;
    if (!["auto", "30", "45", "60"].includes(clipLength)) clipLength = "auto";

    await db.job.update({
      where: { id: job.id },
      data: { ratio, clipCount, clipLength },
    });

    enqueueJob(job.id);
    return NextResponse.json({ id: job.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not start the job.";
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}

const RATIOS_OK = new Set(["9:16", "1:1", "4:5", "16:9"]);

export function serializeJob(j: {
  id: string;
  source: string;
  url: string | null;
  title: string | null;
  duration: number | null;
  ratio: string;
  clipCount: number;
  clipLength: string;
  captions: boolean;
  status: string;
  stage: string;
  progress: number;
  error: string | null;
  language: string | null;
  clips: Array<{
    id: string; index: number; start: number; end: number; duration: number;
    score: number; hook: number; energy: number; pacing: number; flow: number;
    reason: string | null; title: string | null; hashtags: string | null;
    text: string | null; file: string | null; poster: string | null;
  }>;
}) {
  return {
    ...j,
    clips: j.clips.map((c) => ({
      ...c,
      ready: Boolean(c.file),
      streamUrl: `/api/jobs/${j.id}/clips/${c.id}`,
      downloadUrl: `/api/jobs/${j.id}/clips/${c.id}?dl=1`,
      posterUrl: `/api/jobs/${j.id}/clips/${c.id}?poster=1`,
    })),
  };
}
