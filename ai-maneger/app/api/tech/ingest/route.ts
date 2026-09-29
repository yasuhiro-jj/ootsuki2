import { NextResponse } from "next/server";
import { isTechBotAuthorized, techBotSecretsConfigured } from "@/lib/tech-news/auth";
import { IngestError, ingestXArticles } from "@/lib/tech-news/ingest";
import type { IngestArticleInput } from "@/lib/tech-news/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!techBotSecretsConfigured()) {
    return NextResponse.json(
      { ok: false, message: "TECH_NEWS_INGEST_TOKEN または CRON_SECRET を設定してください。" },
      { status: 503 },
    );
  }
  if (!isTechBotAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, message: "認証に失敗しました。" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON を読み取れませんでした。" }, { status: 400 });
  }

  const articles = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { articles?: unknown }).articles)
      ? (body as { articles: IngestArticleInput[] }).articles
      : null;
  if (!articles) {
    return NextResponse.json({ ok: false, message: "articles 配列が必要です。" }, { status: 400 });
  }

  try {
    const result = await ingestXArticles(articles);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: "保存に失敗しました。" }, { status: 500 });
  }
}
