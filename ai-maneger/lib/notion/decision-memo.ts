import {
  createPageInDatabase,
  getDatabaseSchemaProperties,
  getPropertyNameByAliases,
  queryDatabaseAll,
} from "@/lib/notion/client";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";
import type { NotionProperty } from "@/types/notion";

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

function setMappedProperty(
  target: Record<string, unknown>,
  schemaProperties: Record<string, NotionProperty>,
  aliases: string[],
  value: Record<string, unknown>,
) {
  const propertyName = getPropertyNameByAliases(schemaProperties, aliases);
  if (propertyName) {
    target[propertyName] = value;
    return;
  }
  if (Object.keys(schemaProperties).length === 0) {
    target[aliases[0]] = value;
  }
}

function setMappedTextLikeProperty(
  target: Record<string, unknown>,
  schemaProperties: Record<string, NotionProperty>,
  aliases: string[],
  text: string,
  fallbackType: "title" | "rich_text" = "rich_text",
) {
  const propertyName = getPropertyNameByAliases(schemaProperties, aliases);
  const propertyType = propertyName ? schemaProperties[propertyName]?.type : undefined;

  if (propertyName && propertyType === "title") {
    target[propertyName] = { title: richText(text) };
    return;
  }
  if (propertyName && propertyType === "rich_text") {
    target[propertyName] = { rich_text: richText(text) };
    return;
  }
  if (fallbackType === "title") {
    setMappedProperty(target, schemaProperties, aliases, { title: richText(text) });
    return;
  }
  setMappedProperty(target, schemaProperties, aliases, { rich_text: richText(text) });
}

function setMappedStatusLikeProperty(
  target: Record<string, unknown>,
  schemaProperties: Record<string, NotionProperty>,
  aliases: string[],
  statusName: string,
) {
  const propertyName = getPropertyNameByAliases(schemaProperties, aliases);
  const propertyType = propertyName ? schemaProperties[propertyName]?.type : undefined;

  if (propertyName && propertyType === "select") {
    target[propertyName] = { select: { name: statusName } };
    return;
  }
  if (propertyName && propertyType === "status") {
    target[propertyName] = { status: { name: statusName } };
    return;
  }
  setMappedProperty(target, schemaProperties, aliases, { status: { name: statusName } });
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

  const pages = await queryDatabaseAll(memoDbId, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  let schemaProperties = pages[0]?.properties ?? {};
  if (Object.keys(schemaProperties).length === 0) {
    schemaProperties = await getDatabaseSchemaProperties(memoDbId);
  }
  if (Object.keys(schemaProperties).length === 0) {
    throw new Error(
      "判断メモDBのプロパティ定義を取得できませんでした。Notion連携先IDとインテグレーション権限を確認してください。",
    );
  }

  const properties: Record<string, unknown> = {};
  setMappedTextLikeProperty(
    properties,
    schemaProperties,
    ["タイトル", "件名", "名前", "Name", "title", "日付メモ", "週（メモ）"],
    payload.title?.trim() || "メモ",
    "title",
  );
  setMappedProperty(properties, schemaProperties, ["カテゴリ", "Category", "種別"], {
    select: { name: "判断メモ" },
  });
  setMappedStatusLikeProperty(
    properties,
    schemaProperties,
    ["ステータス", "Status"],
    payload.status?.trim() || "進行中",
  );
  setMappedProperty(properties, schemaProperties, ["日付", "Date"], { date: { start: todayInTokyo() } });
  setMappedTextLikeProperty(
    properties,
    schemaProperties,
    ["要点", "要約", "Summary"],
    payload.summary.trim(),
  );
  setMappedTextLikeProperty(
    properties,
    schemaProperties,
    ["関連数字", "数値", "Related Numbers"],
    payload.relatedNumbers?.trim() || "",
  );
  setMappedTextLikeProperty(
    properties,
    schemaProperties,
    ["次アクション", "次のアクション", "Next Action"],
    payload.nextAction?.trim() || "",
  );

  const created = await createPageInDatabase(memoDbId, properties);
  return created.id;
}
