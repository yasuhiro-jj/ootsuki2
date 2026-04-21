import { resolveWeekRange } from "@/lib/ootsuki";
import {
  createPageInDatabase,
  getPage,
  getPropertyCheckbox,
  getPropertyDate,
  getPropertyNameByAliases,
  getPropertyNumber,
  getPropertyText,
  queryDatabaseAll,
  toText,
  updatePage,
} from "@/lib/notion/client";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";
import type {
  DailyInputPayload,
  KpiSnapshotEntry,
  MemoEntry,
  OotsukiProjectOverview,
  WeeklyActionPlan,
  WeeklyReviewDraft,
  WeeklyReviewPayload,
} from "@/types/ootsuki";
import type { NotionBlock, NotionPage, NotionProperty } from "@/types/notion";

async function cfg() {
  return await getActiveTenantNotionConfig();
}

const PROJECT_NAME_KEYS = ["案件名", "名前", "Name", "title"];
const KPI_TARGET_KEYS = ["KPI目標", "KPI Target"];
const KPI_ACTUAL_KEYS = ["KPI実績", "KPI Actual"];
const CATEGORY_KEYS = ["カテゴリ", "Category", "種別"];
const STATUS_KEYS = ["ステータス", "Status"];
const SUMMARY_KEYS = ["要点", "要約", "Summary"];
const RELATED_NUMBER_KEYS = ["関連数字", "数値", "Related Numbers"];
const NEXT_ACTION_KEYS = ["次アクション", "次のアクション", "Next Action"];
const TITLE_KEYS = ["タイトル", "件名", "名前", "Name", "title", "日付メモ", "週（メモ）"];
const DATE_KEYS = ["日付", "Date"];
const WEEK_START_KEYS = ["週開始", "開始週", "Week Start"];
const WEEK_END_KEYS = ["週終了", "終了週", "Week End"];
const SALES_KEYS = ["売上", "売上高", "Sales", "売上(税抜)"];
const CUSTOMERS_KEYS = ["客数", "Customers"];
const AVERAGE_SPEND_KEYS = ["客単価", "Average Spend", "客単価(自動)"];
const GROSS_MARGIN_KEYS = ["粗利率(%)", "粗利率", "Gross Margin Rate"];
const GROSS_PROFIT_KEYS = ["粗利", "粗利額", "Gross Profit"];
const LINE_REGISTRATION_KEYS = ["LINE登録数", "LINE友だち追加数"];
const LINE_VISIT_KEYS = ["LINE経由来店数", "LINE来店数"];
const SALES_YOY_KEYS = ["売上昨対比", "売上前年差異", "Sales YoY", "売上前年比(%)"];
const CUSTOMERS_YOY_KEYS = ["客数昨対比", "客数前年差", "Customers YoY", "客数前年比(%)"];
const AVERAGE_SPEND_YOY_KEYS = [
  "客単価昨対比",
  "客単価前年差",
  "Average Spend YoY",
  "客単価前年比(%)",
];
const RETURNS_KEYS = ["取消返品", "取消/返品金額", "返品金額"];
const DISCOUNT_KEYS = ["値引き", "値引き金額"];
const NOTES_KEYS = ["メモ", "備考", "Notes", "所感/メモ"];
const PAYMENT_MEMO_KEYS = ["決済内訳メモ", "決済メモ", "決済内訳（メモ）"];
const SOURCE_KEYS = ["ソース", "データソース", "Source", "ソース（CSV名等）", "ソース（貼付/URL）"];
const ESTIMATED_COST_KEYS = ["想定原価", "原価", "Estimated Cost"];
const EXCLUDED_KEYS = ["計算対象外", "除外", "Excluded"];
const MEO_KEYS = ["MEO"];
const LINE_DONE_KEYS = ["LINE"];
const STORE_POP_KEYS = ["店頭POP"];

function richText(content: string) {
  return [{ type: "text", text: { content: content || " " } }];
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

function asParagraphText(block: NotionBlock) {
  return (
    toText(block.paragraph?.rich_text) ||
    toText(block.heading_1?.rich_text) ||
    toText(block.heading_2?.rich_text) ||
    toText(block.heading_3?.rich_text) ||
    toText(block.bulleted_list_item?.rich_text)
  );
}

function mapProjectOverview(page: NotionPage): OotsukiProjectOverview {
  return {
    id: page.id,
    name: getPropertyText(page.properties, PROJECT_NAME_KEYS) || "食事処おおつき",
    status: getPropertyText(page.properties, STATUS_KEYS) || "運用中",
    kpiTarget: getPropertyText(page.properties, KPI_TARGET_KEYS) || "未設定",
    kpiActual: getPropertyText(page.properties, KPI_ACTUAL_KEYS) || "未設定",
    updatedAt: page.last_edited_time,
  };
}

function mapMemoEntry(page: NotionPage): MemoEntry {
  return {
    id: page.id,
    title: getPropertyText(page.properties, TITLE_KEYS) || "メモ",
    date: getPropertyDate(page.properties, DATE_KEYS),
    category: getPropertyText(page.properties, CATEGORY_KEYS) || "",
    status: getPropertyText(page.properties, STATUS_KEYS) || "",
    summary: getPropertyText(page.properties, SUMMARY_KEYS) || "",
    relatedNumbers: getPropertyText(page.properties, RELATED_NUMBER_KEYS) || "",
    nextAction: getPropertyText(page.properties, NEXT_ACTION_KEYS) || "",
    updatedAt: page.last_edited_time,
    url: page.url,
  };
}

function mapKpiEntry(page: NotionPage): KpiSnapshotEntry {
  const date = getPropertyDate(page.properties, DATE_KEYS);
  const weekStart =
    getPropertyDate(page.properties, WEEK_START_KEYS) ||
    (date ? resolveWeekRange(date).weekStart : "");
  const weekEnd =
    getPropertyDate(page.properties, WEEK_END_KEYS) ||
    (date ? resolveWeekRange(date).weekEnd : "");
  const sales = getPropertyNumber(page.properties, SALES_KEYS) ?? 0;
  const customers = getPropertyNumber(page.properties, CUSTOMERS_KEYS) ?? 0;
  const averageSpend =
    getPropertyNumber(page.properties, AVERAGE_SPEND_KEYS) ??
    (customers > 0 ? sales / customers : 0);
  const grossMarginRate = getPropertyNumber(page.properties, GROSS_MARGIN_KEYS) ?? 0;
  const grossProfit =
    getPropertyNumber(page.properties, GROSS_PROFIT_KEYS) ?? sales * (grossMarginRate / 100);

  return {
    id: page.id,
    title:
      getPropertyText(page.properties, TITLE_KEYS) ||
      (date ? `${date} 日次売上` : `${weekStart} 週次集計`),
    date,
    weekStart,
    weekEnd,
    sales,
    customers,
    averageSpend,
    grossMarginRate,
    grossProfit,
    lineRegistrations: getPropertyNumber(page.properties, LINE_REGISTRATION_KEYS) ?? 0,
    lineVisits: getPropertyNumber(page.properties, LINE_VISIT_KEYS) ?? 0,
    salesYoY: getPropertyNumber(page.properties, SALES_YOY_KEYS),
    customersYoY: getPropertyNumber(page.properties, CUSTOMERS_YOY_KEYS),
    averageSpendYoY: getPropertyNumber(page.properties, AVERAGE_SPEND_YOY_KEYS),
    returnsAmount: getPropertyNumber(page.properties, RETURNS_KEYS) ?? 0,
    discountAmount: getPropertyNumber(page.properties, DISCOUNT_KEYS) ?? 0,
    notes: getPropertyText(page.properties, NOTES_KEYS),
    paymentMemo: getPropertyText(page.properties, PAYMENT_MEMO_KEYS),
    source: getPropertyText(page.properties, SOURCE_KEYS),
    createdAt: page.created_time || page.last_edited_time,
  };
}

export async function getOotsukiProjectOverview() {
  const notion = await cfg();
  const projectPageId = notion.ootsukiProjectPageId;
  if (projectPageId) {
    try {
      const page = await getPage(projectPageId);
      return mapProjectOverview(page);
    } catch (error) {
      console.warn("[ootsuki] failed to load project page directly:", error);
    }
  }

  const fallbackDbId = notion.projectDbId;
  const pages = await queryDatabaseAll(fallbackDbId);
  const fallbackPage = pages.find((page) => !projectPageId || page.id === projectPageId);
  if (fallbackPage) return mapProjectOverview(fallbackPage);

  return {
    id: "",
    name: "食事処おおつき",
    status: "未設定",
    kpiTarget: "未設定",
    kpiActual: "未設定",
    updatedAt: new Date(0).toISOString(),
  };
}

export async function getKpiEntries() {
  const notion = await cfg();
  const [dailyPages, summaryPages] = await Promise.all([
    queryDatabaseAll(notion.dailySalesDbId),
    queryDatabaseAll(notion.kpiDbId),
  ]);
  return [...dailyPages, ...summaryPages].map(mapKpiEntry);
}

export async function getLatestDecisionMemoEntries(limit = 5) {
  const notion = await cfg();
  const pages = await queryDatabaseAll(notion.memoDbId, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  return pages.map(mapMemoEntry).filter((entry) => entry.category !== "振り返り").slice(0, limit);
}

export async function getLatestStrategyMemo() {
  const entries = await getLatestDecisionMemoEntries(1);
  return entries[0] ?? null;
}

export async function getLatestWeeklyReviewEntries(limit = 3) {
  const notion = await cfg();
  const pages = await queryDatabaseAll(notion.memoDbId, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  return pages.map(mapMemoEntry).filter((entry) => entry.category === "振り返り").slice(0, limit);
}

export async function getWeeklyReviewDraft(weekStart: string, weekEnd: string): Promise<WeeklyReviewDraft | null> {
  const entries = await getLatestWeeklyReviewEntries(100);
  const matched = entries.find(
    (entry) =>
      entry.date === weekStart ||
      entry.title.includes(weekStart) ||
      entry.relatedNumbers.includes(weekStart) ||
      entry.relatedNumbers.includes(weekEnd),
  );

  if (!matched) return null;

  return {
    id: matched.id,
    status: matched.status || "進行中",
    summary: matched.summary || "",
    relatedNumbers: matched.relatedNumbers || "",
    nextActions: (matched.nextAction || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*・]\s*/, "").trim())
      .filter(Boolean),
    updatedAt: matched.updatedAt,
    url: matched.url,
  };
}

export async function getCurrentLineMessage() {
  const notion = await cfg();
  const lineReportPageId = notion.lineReportPageId;
  if (!lineReportPageId) {
    return {
      title: "LINE配信文 未設定",
      body: "NOTION_OOTSUKI_LINE_REPORT_PAGE_ID を設定すると、最新のLINE配信文を表示できます。",
    };
  }

  const response = await fetch(`https://api.notion.com/v1/blocks/${lineReportPageId}/children?page_size=100`, {
    headers: {
      Authorization: `Bearer ${notion.notionToken}`,
      "Notion-Version": process.env.NOTION_API_VERSION?.trim() || "2022-06-28",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return { title: "LINE配信文 取得失敗", body: "LINE配信文ページを取得できませんでした。" };
  }

  const data = (await response.json()) as { results?: NotionBlock[] };
  const lines = (data.results ?? []).map(asParagraphText).filter(Boolean);
  return {
    title: lines[0] || "LINE配信文",
    body: lines.slice(1).join("\n") || "本文未設定",
  };
}

export async function getWeeklyActionPlan(weekStart: string, weekEnd: string): Promise<WeeklyActionPlan | null> {
  const notion = await cfg();
  const weeklyActionsDbId = notion.weeklyActionsDbId;
  if (!weeklyActionsDbId) return null;

  const pages = await queryDatabaseAll(weeklyActionsDbId, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  const matched = pages.find((page) => {
    const start = getPropertyDate(page.properties, WEEK_START_KEYS);
    const end = getPropertyDate(page.properties, WEEK_END_KEYS);
    return start === weekStart && end === weekEnd;
  });
  if (!matched) return null;

  const actionsText = getPropertyText(matched.properties, ["実行項目", "Actions", "内容"]) || "";
  const actions = actionsText
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*・]\s*/, "").trim())
    .filter(Boolean);

  return {
    id: matched.id,
    title: getPropertyText(matched.properties, TITLE_KEYS) || `${weekStart} 実行項目`,
    weekStart,
    weekEnd,
    actions,
    status: getPropertyText(matched.properties, STATUS_KEYS),
    source: getPropertyText(matched.properties, SOURCE_KEYS),
    updatedAt: matched.last_edited_time,
    url: matched.url,
  };
}

export async function saveWeeklyActionPlan(payload: {
  weekStart: string;
  weekEnd: string;
  actions: string[];
  source?: string;
  status?: string;
}) {
  const notion = await cfg();
  const weeklyActionsDbId = notion.weeklyActionsDbId;
  if (!weeklyActionsDbId) {
    throw new Error("NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID が未設定です");
  }

  const existing = await getWeeklyActionPlan(payload.weekStart, payload.weekEnd);
  const properties = {
    タイトル: { title: richText(`${payload.weekStart} 実行項目`) },
    週開始: { date: { start: payload.weekStart } },
    週終了: { date: { start: payload.weekEnd } },
    実行項目: { rich_text: richText(payload.actions.join("\n")) },
    ステータス: { status: { name: payload.status || "提案済み" } },
    ソース: { rich_text: richText(payload.source || "ダッシュボードAI提案") },
  };

  if (existing?.id) {
    await updatePage(existing.id, { properties });
    return existing.id;
  }

  const created = await createPageInDatabase(weeklyActionsDbId, properties);
  return created.id;
}

export async function saveWeeklyReview(payload: WeeklyReviewPayload) {
  const notion = await cfg();
  const memoDbId = notion.memoDbId;
  const pages = await queryDatabaseAll(memoDbId, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  const existing = pages.find((page) => {
    const category = getPropertyText(page.properties, CATEGORY_KEYS);
    const start = getPropertyDate(page.properties, WEEK_START_KEYS) || getPropertyDate(page.properties, DATE_KEYS);
    const end = getPropertyDate(page.properties, WEEK_END_KEYS);
    return category === "振り返り" && start === payload.weekStart && (!end || end === payload.weekEnd);
  });

  const properties = {
    タイトル: { title: richText(`${payload.weekStart} 週次レビュー`) },
    カテゴリ: { select: { name: "振り返り" } },
    ステータス: { status: { name: payload.status || "進行中" } },
    週開始: { date: { start: payload.weekStart } },
    週終了: { date: { start: payload.weekEnd } },
    要点: { rich_text: richText(payload.summary) },
    関連数字: { rich_text: richText(payload.relatedNumbers || "") },
    次アクション: { rich_text: richText(payload.nextActions.join("\n")) },
  };

  if (existing) {
    await updatePage(existing.id, { properties });
    return existing.id;
  }

  const created = await createPageInDatabase(memoDbId, properties);
  return created.id;
}

export async function saveDailyInput(payload: DailyInputPayload) {
  const notion = await cfg();
  const dailySalesDbId = notion.dailySalesDbId;
  if (!dailySalesDbId) {
    throw new Error("NOTION_OOTSUKI_DAILY_SALES_DB_ID が未設定です");
  }

  const pages = await queryDatabaseAll(dailySalesDbId);
  const existing = pages.find((page) => getPropertyDate(page.properties, DATE_KEYS) === payload.date);
  const weekRange = resolveWeekRange(payload.date);
  const schemaProperties = existing?.properties ?? pages[0]?.properties ?? {};
  const properties: Record<string, unknown> = {};

  setMappedProperty(properties, schemaProperties, TITLE_KEYS, { title: richText(`${payload.date} 日次売上`) });
  setMappedProperty(properties, schemaProperties, DATE_KEYS, { date: { start: payload.date } });
  setMappedProperty(properties, schemaProperties, WEEK_START_KEYS, { date: { start: weekRange.weekStart } });
  setMappedProperty(properties, schemaProperties, WEEK_END_KEYS, { date: { start: weekRange.weekEnd } });
  setMappedProperty(properties, schemaProperties, SALES_KEYS, { number: payload.sales });
  setMappedProperty(properties, schemaProperties, CUSTOMERS_KEYS, { number: payload.customers });
  setMappedProperty(properties, schemaProperties, AVERAGE_SPEND_KEYS, { number: payload.averageSpend });
  setMappedProperty(properties, schemaProperties, GROSS_MARGIN_KEYS, { number: payload.grossMarginRate });
  setMappedProperty(properties, schemaProperties, GROSS_PROFIT_KEYS, { number: payload.grossProfit });
  setMappedProperty(properties, schemaProperties, LINE_REGISTRATION_KEYS, { number: payload.lineRegistrations });
  setMappedProperty(properties, schemaProperties, LINE_VISIT_KEYS, { number: payload.lineVisits });
  setMappedProperty(properties, schemaProperties, SALES_YOY_KEYS, { number: payload.salesYoY ?? null });
  setMappedProperty(properties, schemaProperties, CUSTOMERS_YOY_KEYS, { number: payload.customersYoY ?? null });
  setMappedProperty(properties, schemaProperties, AVERAGE_SPEND_YOY_KEYS, {
    number: payload.averageSpendYoY ?? null,
  });
  setMappedProperty(properties, schemaProperties, RETURNS_KEYS, { number: payload.returnsAmount });
  setMappedProperty(properties, schemaProperties, DISCOUNT_KEYS, { number: payload.discountAmount });
  setMappedProperty(properties, schemaProperties, PAYMENT_MEMO_KEYS, {
    rich_text: richText(payload.paymentMemo || ""),
  });
  setMappedProperty(properties, schemaProperties, SOURCE_KEYS, {
    rich_text: richText(payload.source || "Web日次入力"),
  });
  setMappedProperty(properties, schemaProperties, NOTES_KEYS, { rich_text: richText(payload.memo || "") });
  setMappedProperty(properties, schemaProperties, MEO_KEYS, { checkbox: payload.meoDone });
  setMappedProperty(properties, schemaProperties, LINE_DONE_KEYS, { checkbox: payload.lineDone });
  setMappedProperty(properties, schemaProperties, STORE_POP_KEYS, { checkbox: payload.storePopDone });

  if (existing) {
    await updatePage(existing.id, { properties });
  } else {
    await createPageInDatabase(dailySalesDbId, properties);
  }

  try {
    await upsertWeeklySummary(payload.date);
  } catch (error) {
    // Keep daily input successful even when weekly summary sync fails.
    console.warn("[ootsuki] weekly summary sync failed after daily save:", error);
  }
}

export async function saveDailyInputBatch(payloads: DailyInputPayload[]) {
  const results: Array<{ date: string; ok: boolean; message?: string }> = [];

  for (const payload of payloads) {
    try {
      await saveDailyInput(payload);
      results.push({ date: payload.date, ok: true });
    } catch (error) {
      results.push({
        date: payload.date,
        ok: false,
        message: error instanceof Error ? error.message : "保存に失敗しました。",
      });
    }
  }

  return results;
}

export async function upsertWeeklySummary(referenceDate: string) {
  const notion = await cfg();
  const kpiDbId = notion.kpiDbId;
  const allEntries = await getKpiEntries();
  const weekRange = resolveWeekRange(referenceDate);
  const dailyEntries = allEntries.filter((entry) => entry.date);
  const weeklyRows = dailyEntries.filter(
    (entry) => entry.weekStart === weekRange.weekStart && entry.weekEnd === weekRange.weekEnd,
  );

  const sales = weeklyRows.reduce((sum, entry) => sum + entry.sales, 0);
  const customers = weeklyRows.reduce((sum, entry) => sum + entry.customers, 0);
  const grossProfit = weeklyRows.reduce((sum, entry) => sum + entry.grossProfit, 0);
  const lineRegistrations = weeklyRows.reduce((sum, entry) => sum + entry.lineRegistrations, 0);
  const lineVisits = weeklyRows.reduce((sum, entry) => sum + entry.lineVisits, 0);
  const averageSpend = customers > 0 ? sales / customers : 0;
  const grossMarginRate = sales > 0 ? (grossProfit / sales) * 100 : 0;
  const note = weeklyRows.map((entry) => entry.notes).filter(Boolean).join("\n");

  const kpiPages = await queryDatabaseAll(kpiDbId);
  const existing = kpiPages.find((page) => {
    const start = getPropertyDate(page.properties, WEEK_START_KEYS);
    const end = getPropertyDate(page.properties, WEEK_END_KEYS);
    const title = getPropertyText(page.properties, TITLE_KEYS) || "";
    return (
      start === weekRange.weekStart &&
      end === weekRange.weekEnd &&
      (title.includes("週次") || !getPropertyDate(page.properties, DATE_KEYS))
    );
  });

  const schemaProperties = existing?.properties ?? kpiPages[0]?.properties ?? {};
  const properties: Record<string, unknown> = {};

  setMappedProperty(properties, schemaProperties, TITLE_KEYS, {
    title: richText(`週次集計 ${weekRange.weekStart}`),
  });
  setMappedProperty(properties, schemaProperties, WEEK_START_KEYS, { date: { start: weekRange.weekStart } });
  setMappedProperty(properties, schemaProperties, WEEK_END_KEYS, { date: { start: weekRange.weekEnd } });
  setMappedProperty(properties, schemaProperties, SALES_KEYS, { number: sales });
  setMappedProperty(properties, schemaProperties, CUSTOMERS_KEYS, { number: customers });
  setMappedProperty(properties, schemaProperties, AVERAGE_SPEND_KEYS, { number: averageSpend });
  setMappedProperty(properties, schemaProperties, GROSS_MARGIN_KEYS, { number: grossMarginRate });
  setMappedProperty(properties, schemaProperties, GROSS_PROFIT_KEYS, { number: grossProfit });
  setMappedProperty(properties, schemaProperties, LINE_REGISTRATION_KEYS, { number: lineRegistrations });
  setMappedProperty(properties, schemaProperties, LINE_VISIT_KEYS, { number: lineVisits });
  setMappedProperty(properties, schemaProperties, NOTES_KEYS, { rich_text: richText(note) });
  setMappedProperty(properties, schemaProperties, SOURCE_KEYS, {
    rich_text: richText("自動集計"),
  });

  if (existing) {
    await updatePage(existing.id, { properties });
    return existing.id;
  }

  const created = await createPageInDatabase(kpiDbId, properties);
  return created.id;
}

export async function getProductEstimatedCosts(
  _products: Array<{ productCode?: string; productName?: string }>,
) {
  const notion = await cfg();
  const pages = await queryDatabaseAll(notion.productCostDbId);
  const byCode: Record<string, { estimatedCost: number; excluded: boolean }> = {};
  const byName: Record<string, { estimatedCost: number; excluded: boolean }> = {};

  for (const page of pages) {
    const code = getPropertyText(page.properties, ["商品コード", "Code"]).replace(/[^\dA-Za-z]/g, "").toLowerCase();
    const name = getPropertyText(page.properties, ["商品名", "Name"])
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .replace(/[()（）【】\[\]「」『』・\/]/g, "")
      .toLowerCase();
    const estimatedCost = getPropertyNumber(page.properties, ESTIMATED_COST_KEYS) ?? 0;
    const excluded = getPropertyCheckbox(page.properties, EXCLUDED_KEYS);

    if (code) {
      byCode[code] = { estimatedCost, excluded };
    }
    if (name) {
      byName[name] = { estimatedCost, excluded };
    }
  }

  return { byCode, byName };
}
