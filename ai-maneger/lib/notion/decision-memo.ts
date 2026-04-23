import { createPageInDatabase } from "@/lib/notion/client";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";

function richText(content: string) {
  return [{ type: "text", text: { content: content || " " } }];
}

function todayInTokyo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function saveDecisionMemo(payload: {
  title?: string;
  status?: string;
  summary: string;
  relatedNumbers?: string;
  nextAction?: string;
}) {
  const notion = await getActiveTenantNotionConfig();
  const memoDbId = notion.memoDbId;
  if (!memoDbId) {
    throw new Error("NOTION_OOTSUKI_MEMO_DB_ID が未設定です");
  }

  const properties = {
    タイトル: { title: richText(payload.title?.trim() || "メモ") },
    カテゴリ: { select: { name: "判断メモ" } },
    ステータス: { status: { name: payload.status?.trim() || "進行中" } },
    日付: { date: { start: todayInTokyo() } },
    要点: { rich_text: richText(payload.summary.trim()) },
    関連数字: { rich_text: richText(payload.relatedNumbers?.trim() || "") },
    次アクション: { rich_text: richText(payload.nextAction?.trim() || "") },
  };

  const created = await createPageInDatabase(memoDbId, properties);
  return created.id;
}
