import { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { db } from "@/lib/db";
import { jobDir } from "@/lib/pipeline/runner";

export const runtime = "nodejs";

/**
 * GET /api/jobs/[id]/clips/[clipId][?dl=1|&poster=1]
 * Streams the mp4 with Range support (needed for phone video players),
 * the poster JPEG, or forces a download with a friendly filename.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await ctx.params;
  const clip = await db.clip.findFirst({ where: { id: clipId, jobId: id } });
  if (!clip || !clip.file) return new Response("Not found", { status: 404 });

  const dir = jobDir(id);
  const wantsPoster = req.nextUrl.searchParams.get("poster") === "1";
  const wantsDownload = req.nextUrl.searchParams.get("dl") === "1";

  if (wantsPoster) {
    if (!clip.poster) return new Response("No poster", { status: 404 });
    const p = path.join(dir, clip.poster);
    const st = await stat(p).catch(() => null);
    if (!st) return new Response("No poster", { status: 404 });
    const stream = Readable.toWeb(createReadStream(p)) as unknown as ReadableStream;
    return new Response(stream, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  }

  const filePath = path.join(dir, clip.file);
  const st = await stat(filePath).catch(() => null);
  if (!st) return new Response("File missing — job may have been cleaned up.", { status: 410 });

  const size = st.size;
  const fileName = `viralcut-clip-${clip.index}-${Math.round(clip.duration)}s.mp4`;
  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Cache-Control": "public, max-age=86400",
    ...(wantsDownload ? { "Content-Disposition": `attachment; filename="${fileName}"` } : {}),
  };

  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end) start = 0;
    const stream = Readable.toWeb(
      createReadStream(filePath, { start, end })
    ) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
