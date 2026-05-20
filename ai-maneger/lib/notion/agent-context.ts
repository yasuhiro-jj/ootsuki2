import type { TenantKey } from "@/lib/tenant-config/types";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import {
  buildDailySalesDbMonthlyContext,
  extractNotionDatabaseId,
  PRIMARY_DAILY_SALES_DB_ID,
  resolveDailySalesDbIds,
} from "@/lib/notion/sales-monthly-context";

function read(value?: string | null) {
  return value?.trim() || "";
}

function resolveReferenceDbIds(tenant: TenantKey) {
  const tenantRaw =
    tenant === "demo"
      ? read(process.env.NOTION_DEMO_AGENT_REFERENCE_DB_ID)
      : read(process.env.NOTION_OOTSUKI_AGENT_REFERENCE_DB_ID);
  const fallbackRaw = read(process.env.NOTION_AGENT_REFERENCE_DB_ID);
  const merged = [tenantRaw, fallbackRaw].filter(Boolean).join(",");
  const ids = merged
    .split(",")
    .map((value) => extractNotionDatabaseId(value))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

export async function getAlwaysOnNotionReferenceContext(tenant: TenantKey) {
  const referenceDbIds = resolveReferenceDbIds(tenant);
  const tenantConfig = await getTenantNotionConfig(tenant);
  const dailySalesDbIds = resolveDailySalesDbIds(referenceDbIds, tenantConfig.dailySalesDbId);

  if (!dailySalesDbIds.length) return "";

  const sections: string[] = [];
  for (const dbId of dailySalesDbIds) {
    try {
      const monthlyContext = await buildDailySalesDbMonthlyContext(dbId);
      if (monthlyContext.includes("日次売上レコードが見つかりません")) {
        if (dbId !== PRIMARY_DAILY_SALES_DB_ID) continue;
      }
      sections.push(monthlyContext);
    } catch (error) {
      console.warn(`[agent-context] failed to load daily sales db ${dbId}:`, error);
      if (dbId === PRIMARY_DAILY_SALES_DB_ID || referenceDbIds.includes(dbId)) {
        sections.push(`【DB ID: ${dbId}】\n- 取得エラー: ${error instanceof Error ? error.message : "不明"}`);
      }
    }
  }

  if (!sections.length) return "";

  return [
    "【常時参照Notion DB（最優先）】",
    `参照DB数: ${dailySalesDbIds.length}`,
    "日次売上DBの全月次データを根拠に回答すること。4月・5月など月指定の比較質問は必ず【月次サマリー】を使う。",
    "「DB上で未確認」と答える前に、下記の利用可能な月一覧を必ず確認すること。",
    ...sections,
  ].join("\n\n");
}
