import { NextResponse } from "next/server";
import { isTechBotAuthorized, techBotSecretsConfigured } from "@/lib/tech-news/auth";
import { collectMediaArticles } from "@/lib/tech-news/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function hasSession(request: Request) {
  return /(?:^|;\s*)auth_session=/.test(request.headers.get("cookie") || "");
}

async function collect(request: Request) {
  const session = hasSession(request);
  const bot = isTechBotAuthorized(request.headers.get("authorization"));
  if (!session && !bot) {
    if (!techBotSecretsConfigured()) {
      return NextResponse.json(
        { ok: false, message: "ログインするか、TECH_NEWS_INGEST_TOKEN を設定してください。" },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: false, message: "認証に失敗しました。" }, { status: 401 });
  }

  try {
    const snapshot = await collectMediaArticles();
    return NextResponse.json({ ok: true, snapshot });
  } catch {
    return NextResponse.json({ ok: false, message: "メディアの取得に失敗しました。" }, { status: 502 });
  }
}

export function GET(request: Request) {
  return collect(request);
}

export function POST(request: Request) {
  return collect(request);
}
