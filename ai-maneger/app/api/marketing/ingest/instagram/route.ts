import { NextResponse } from "next/server";
import {
  instagramIngestSecretsConfigured,
  isInstagramIngestAuthorized,
} from "@/lib/marketing/instagram-ingest-auth";
import { ingestInstagramGrokMetrics } from "@/lib/marketing/instagram-grok-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!instagramIngestSecretsConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "MARKETING_INSTAGRAM_INGEST_TOKEN / GROK_BOT_INGEST_TOKEN / CRON_SECRET のいずれかを Vercel に設定してください。",
      },
      { status: 503 },
    );
  }
  if (!isInstagramIngestAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, message: "認証に失敗しました。" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON を読み取れませんでした。" }, { status: 400 });
  }

  try {
    const result = await ingestInstagramGrokMetrics(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存に失敗しました。";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}