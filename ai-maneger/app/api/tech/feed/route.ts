import { NextResponse } from "next/server";
import { loadTechNews } from "@/lib/tech-news/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadTechNews();
  return NextResponse.json({ ok: true, snapshot });
}
