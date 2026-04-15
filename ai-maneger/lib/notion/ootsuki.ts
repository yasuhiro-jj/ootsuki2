import { resolveWeekRange } from "@/lib/ootsuki";
import {
  createPage,
  getPage,
  getPropertyCheckbox,
  getPropertyDate,
  getPropertyNumber,
  getPropertyText,
  queryDatabaseAll,
  toText,
  updatePage,
} from "@/lib/notion/client";
import type {
  DailyInputPayload,
  KpiSnapshotEntry,
  MemoEntry,
  OotsukiProjectOverview,
  WeeklyActionPlan,
  WeeklyReviewDraft,
  WeeklyReviewPayload,
} from "@/types/ootsuki";
import type { NotionBlock, NotionPage } from "@/types/notion";

const OOTSUKI_PROJECT_PAGE_ID = process.env.NOTION_OOTSUKI_PROJECT_PAGE_ID?.trim() || "";
const DAILY_SALES_DB_ID = process.env.NOTION_OOTSUKI_DAILY_SALES_DB_ID?.trim() || "";
const KPI_DB_ID = process.env.NOTION_OOTSUKI_KPI_DB_ID?.trim() || "";
const MEMO_DB_ID = process.env.NOTION_OOTSUKI_MEMO_DB_ID?.trim() || "";
const LINE_REPORT_PAGE_ID = process.env.NOTION_OOTSUKI_LINE_REPORT_PAGE_ID?.trim() || "";
const PRODUCT_COST_DB_ID = process.env.NOTION_OOTSUKI_PRODUCT_COST_DB_ID?.trim() || "";
const WEEKLY_ACTIONS_DB_ID = process.env.NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID?.trim() || "";

const PROJECT_NAME_KEYS = ["案件名", "名前", "Name", "title"];
const KPI_TARGET_KEYS = ["KPI目標", "KPI Target"];
const KPI_ACTUAL_KEYS = ["KPI実績", "KPI Actual"];
const CATEGORY_KEYS = ["カテゴリ", "Category", "種別"];
const STATUS_KEYS = ["ステータス", "Status"];
const SUMMARY_KEYS = ["要点", "要約", "Summary"];
const RELATED_NUMBER_KEYS = ["関連数字", "数値", "Related Numbers"];
const NEXT_ACTION_KEYS = ["次アクション", "次のアクション", "Next Action"];
const TITLE_KEYS = ["タイトル", "件名", "名前", "Name", "title"];
const DATE_KEYS = ["日付", "Date"];
const WEEK_START_KEYS = ["週開始", "開始週", "Week Start"];
const WEEK_END_KEYS = ["週終了", "終了週", "Week End"];
const SALES_KEYS = ["売上", "売上高", "Sales"];
const CUSTOMERS_KEYS = ["客数", "Customers"];
const AVERAGE_SPEND_KEYS = ["客単価", "Average Spend"];
const GROSS_MARGIN_KEYS = ["粗利率(%)", "粗利率", "Gross Margin Rate"];
const GROSS_PROFIT_KEYS = ["粗利", "粗利額", "Gross Profit"];
const LINE_REGISTRATION_KEYS = ["LINE登録数", "LINE友だち追加数"];
const LINE_VISIT_KEYS = ["LINE経由来店数", "LINE来店数"];
const SALES_YOY_KEYS = ["売上昨対比", "売上前年差異", "Sales YoY"];
const CUSTOMERS_YOY_KEYS = ["客数昨対比", "客数前年差", "Customers YoY"];
const AVERAGE_SPEND_YOY_KEYS = ["客単価昨対比", "客単価前年差", "Average Spend YoY"];
const RETURNS_KEYS = ["取消返品", "取消/返品金額", "返品金額"];
const DISCOUNT_KEYS = ["値引き", "値引き金額"];
const NOTES_KEYS = ["メモ", "備考", "Notes"];
const PAYMENT_MEMO_KEYS = ["決済内訳メモ", "決済メモ"];
const SOURCE_KEYS = ["ソース", "データソース", "Source"];
const ESTIMATED_COST_KEYS = ["想定原価", "原価", "Estimated Cost"];
const EXCLUDED_KEYS = ["計算対象外", "除外", "Excluded"];

function richText(content: string) {
  return [{ type: "text", text: { content: content || " " } }];
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
    category: getPropertyText(page.properties, CATEGORY_KEYS),
    status: getPropertyText(page.properties, STATUS_KEYS),
    summary: getPropertyText(page.properties, SUMMARY_KEYS),
    relatedNumbers: getPropertyText(page.properties, RELATED_NUMBER_KEYS),
    nextAction: getPropertyText(page.properties, NEXT_ACTION_KEYS),
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
  if (OOTSUKI_PROJECT_PAGE_ID) {
    try {
      const page = await getPage(OOTSUKI_PROJECT_PAGE_ID);
      return mapProjectOverview(page);
    } catch (error) {
      console.warn("[ootsuki] failed to load project page directly:", error);
    }
  }

  const fallbackDbId = process.env.NOTION_PROJECT_DB_ID?.trim() || "";
  const pages = await queryDatabaseAll(fallbackDbId);
  const fallbackPage = pages.find((page) => !OOTSUKI_PROJECT_PAGE_ID || page.id === OOTSUKI_PROJECT_PAGE_ID);
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
  const [dailyPages, summaryPages] = await Promise.all([
    queryDatabaseAll(DAILY_SALES_DB_ID),
    queryDatabaseAll(KPI_DB_ID),
  ]);
  return [...dailyPages, ...summaryPages].map(mapKpiEntry);
}

export async function getLatestDecisionMemoEntries(limit = 5) {
  const pages = await queryDatabaseAll(MEMO_DB_ID, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  return pages.map(mapMemoEntry).filter((entry) => entry.category !== "振り返り").slice(0, limit);
}

export async function getLatestStrategyMemo() {
  const entries = await getLatestDecisionMemoEntries(1);
  return entries[0] ?? null;
}

export async function getLatestWeeklyReviewEntries(limit = 3) {
  const pages = await queryDatabaseAll(MEMO_DB_ID, {
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
    nextActions: matched.nextAction
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*・]\s*/, "").trim())
      .filter(Boolean),
    updatedAt: matched.updatedAt,
    url: matched.url,
  };
}

export async function getCurrentLineMessage() {
  if (!LINE_REPORT_PAGE_ID) {
    return {
      title: "LINE配信文 未設定",
      body: "NOTION_OOTSUKI_LINE_REPORT_PAGE_ID を設定すると、最新のLINE配信文を表示できます。",
    };
  }

  const response = await fetch(`https://api.notion.com/v1/blocks/${LINE_REPORT_PAGE_ID}/children?page_size=100`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_TOKEN?.trim() || process.env.NOTION_API_KEY?.trim() || ""}`,
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
  if (!WEEKLY_ACTIONS_DB_ID) return null;

  const pages = await queryDatabaseAll(WEEKLY_ACTIONS_DB_ID, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  const matched = pages.find((page) => {
    const start = getPropertyDate(page.properties, WEEK_START_KEYS);
    const end = getPropertyDate(page.properties, WEEK_END_KEYS);
    return start === weekStart && end === weekEnd;
  });
  if (!matched) return null;

  const actionsText = getPropertyText(matched.properties, ["実行項目", "Actions", "内容"]);
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
  if (!WEEKLY_ACTIONS_DB_ID) {
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

  const created = await createPage({
    parent: { database_id: WEEKLY_ACTIONS_DB_ID },
    properties,
  });
  return created.id;
}

export async function saveWeeklyReview(payload: WeeklyReviewPayload) {
  const pages = await queryDatabaseAll(MEMO_DB_ID, {
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

  const created = await createPage({
    parent: { database_id: MEMO_DB_ID },
    properties,
  });
  return created.id;
}

export async function saveDailyInput(payload: DailyInputPayload) {
  if (!DAILY_SALES_DB_ID) {
    throw new Error("NOTION_OOTSUKI_DAILY_SALES_DB_ID が未設定です");
  }

  const pages = await queryDatabaseAll(DAILY_SALES_DB_ID);
  const existing = pages.find((page) => getPropertyDate(page.properties, DATE_KEYS) === payload.date);
  const weekRange = resolveWeekRange(payload.date);

  const properties = {
    タイトル: { title: richText(`${payload.date} 日次売上`) },
    日付: { date: { start: payload.date } },
    週開始: { date: { start: weekRange.weekStart } },
    週終了: { date: { start: weekRange.weekEnd } },
    売上: { number: payload.sales },
    客数: { number: payload.customers },
    客単価: { number: payload.averageSpend },
    "粗利率(%)": { number: payload.grossMarginRate },
    粗利: { number: payload.grossProfit },
    LINE登録数: { number: payload.lineRegistrations },
    LINE経由来店数: { number: payload.lineVisits },
    売上昨対比: { number: payload.salesYoY ?? null },
    客数昨対比: { number: payload.customersYoY ?? null },
    客単価昨対比: { number: payload.averageSpendYoY ?? null },
    取消返品: { number: payload.returnsAmount },
    値引き: { number: payload.discountAmount },
    決済内訳メモ: { rich_text: richText(payload.paymentMemo || "") },
    ソース: { rich_text: richText(payload.source || "Web日次入力") },
    メモ: { rich_text: richText(payload.memo || "") },
    MEO: { checkbox: payload.meoDone },
    LINE: { checkbox: payload.lineDone },
    店頭POP: { checkbox: payload.storePopDone },
  };

  if (existing) {
    await updatePage(existing.id, { properties });
  } else {
    await createPage({
      parent: { database_id: DAILY_SALES_DB_ID },
      properties,
    });
  }

  await upsertWeeklySummary(payload.date);
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

  const kpiPages = await queryDatabaseAll(KPI_DB_ID);
  const existing = kpiPages.find((page) => {
    const start = getPropertyDate(page.properties, WEEK_START_KEYS);
    const end = getPropertyDate(page.properties, WEEK_END_KEYS);
    const title = getPropertyText(page.properties, TITLE_KEYS);
    return (
      start === weekRange.weekStart &&
      end === weekRange.weekEnd &&
      (title.includes("週次") || !getPropertyDate(page.properties, DATE_KEYS))
    );
  });

  const properties = {
    タイトル: { title: richText(`週次集計 ${weekRange.weekStart}`) },
    週開始: { date: { start: weekRange.weekStart } },
    週終了: { date: { start: weekRange.weekEnd } },
    売上: { number: sales },
    客数: { number: customers },
    客単価: { number: averageSpend },
    "粗利率(%)": { number: grossMarginRate },
    粗利: { number: grossProfit },
    LINE登録数: { number: lineRegistrations },
    LINE経由来店数: { number: lineVisits },
    メモ: { rich_text: richText(note) },
    ソース: { rich_text: richText("自動集計") },
  };

  if (existing) {
    await updatePage(existing.id, { properties });
    return existing.id;
  }

  const created = await createPage({
    parent: { database_id: KPI_DB_ID },
    properties,
  });
  return created.id;
}

export async function getProductEstimatedCosts(
  _products: Array<{ productCode?: string; productName?: string }>,
) {
  const pages = await queryDatabaseAll(PRODUCT_COST_DB_ID);
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
