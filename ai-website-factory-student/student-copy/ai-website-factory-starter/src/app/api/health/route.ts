import { NextResponse } from "next/server";
import { runHealthProbes } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const result = await runHealthProbes();
    return NextResponse.json(
      {
        ok: result.ok,
        db: result.driver,
        probes: result.probes,
        elapsed_ms: Date.now() - started,
        version: process.env.npm_package_version ?? "0.1.0",
      },
      { status: result.ok ? 200 : 503 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        elapsed_ms: Date.now() - started,
      },
      { status: 503 },
    );
  }
}
