import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { access, constants, mkdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch {
    checks.database = { ok: false, detail: "database_unavailable" };
  }

  try {
    const storagePath = process.env.DOCUMENT_STORAGE_PATH ?? path.join(process.cwd(), ".data", "documents");
    await mkdir(storagePath, { recursive: true });
    await access(storagePath, constants.R_OK | constants.W_OK);
    checks.documentStorage = { ok: true };
  } catch {
    checks.documentStorage = { ok: false, detail: "document_storage_unavailable" };
  }

  const ok = Object.values(checks).every(check => check.ok);
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checks,
      uptimeSeconds: Math.floor(process.uptime()),
      responseMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
