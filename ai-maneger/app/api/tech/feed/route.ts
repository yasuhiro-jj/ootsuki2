import { NextResponse } from "next/server";
import { loadTechNewsFromNotion } from "@/lib/tech-news/notion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadTechNewsFromNotion();
  return NextResponse.json({ ok: true, snapshot });
}
