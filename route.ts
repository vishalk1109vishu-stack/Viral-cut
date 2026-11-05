import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Lightweight health check endpoint for Docker / load balancer probes.
 * Does not touch the DB so it stays fast even under load.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
