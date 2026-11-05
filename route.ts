import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { jobDir } from "@/lib/pipeline/runner";

export const runtime = "nodejs";

/** Poster JPEG for a clip (video thumbnail in results grid). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; clipId: string }> }
) {
  const { id, clipId } = await params;
  const clip = await db.clip.findFirst({ where: { id: clipId, jobId: id } });
  if (!clip || !clip.poster) {
    return NextResponse.json({ error: "Poster missing" }, { status: 404 });
  }
  const filePath = path.join(jobDir(id), clip.poster);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
  const size = statSync(filePath).size;
  const stream = createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
