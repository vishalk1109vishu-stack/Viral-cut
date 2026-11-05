import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeJob } from "../route";
import { rm } from "fs/promises";
import { jobDir } from "@/lib/pipeline/runner";

export const runtime = "nodejs";

/** GET /api/jobs/[id] — poll job status + clips. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await db.job.findUnique({
    where: { id },
    include: { clips: { orderBy: { index: "asc" } } },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ job: serializeJob(job) });
}

/** DELETE /api/jobs/[id] — remove job + files. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.job.delete({ where: { id } }).catch(() => undefined);
  await rm(jobDir(id), { recursive: true, force: true }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
