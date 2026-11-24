import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import {
  getMenuEntries,
  isChatbotMenuConfigured,
  searchMenuEntries,
} from "@/lib/chatbot-strategy/menu-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「おすすめに出したい商品」「出さない商品」の入力補助。
 * チャットボットのメニューDBから部分一致で候補を返す。
 */
export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!query) {
    return NextResponse.json({ ok: true, candidates: [] });
  }

  if (!isChatbotMenuConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message: "メニューDBが未設定です（CHATBOT_NOTION_API_KEY / CHATBOT_NOTION_MENU_DB_ID）。",
      },
      { status: 503 },
    );
  }

  try {
    const entries = await getMenuEntries();
    const candidates = searchMenuEntries(entries, query).map((entry) => ({
      pageId: entry.pageId,
      name: entry.name,
      recommendable: entry.recommendable,
    }));
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "商品の検索に失敗しました。",
      },
      { status: 500 },
    );
  }
}
