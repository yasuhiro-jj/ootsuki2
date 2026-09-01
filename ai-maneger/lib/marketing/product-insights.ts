import { getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";

const PRODUCT_NAME_ALIASES = ["商品名"];
const AVG_PRICE_ALIASES = ["平均単価"];
const EST_COST_ALIASES = ["想定原価"];
const SALES_QTY_ALIASES = ["売上数量"];
const MONTH_ALIASES = ["対象月"];

// ドリンク・割り材・集計用のダミー行など、フードのおすすめとしては不適切なものを除外する簡易キーワード。
// カテゴリ列が未入力のNotion DBのため、商品名からの簡易判定で代用する。
// レジのCSVは半角カナ表記（ﾊｲﾎﾞｰﾙ等）が混在するため、判定前にNFKC正規化してから比較する。
const NON_FOOD_KEYWORDS = [
  "ビール", "ハイボール", "酎ハイ", "サワー", "烏龍茶", "緑茶", "ウーロン茶",
  "ウイスキー", "焼酎", "日本酒", "梅酒", "カクテル", "ソーダ", "コーラ", "ジンジャー",
  "サイダー", "ジュース", "ファンタ", "お茶", "割材", "こおり", "みず", "お湯",
  "パック", "ドリンク", "グラス", "ロック", "水割り",
  // 集計用ダミー行（税区分・LINEクーポン・その他集計）
  "LINE", "軽減税率", "税", "その他", "food",
];

function isLikelyFood(rawName: string): boolean {
  const name = rawName.normalize("NFKC");
  if (/\d+度/.test(name)) return false; // 「二十五度」等の酒の度数表記
  return !NON_FOOD_KEYWORDS.some((keyword) => name.includes(keyword.normalize("NFKC")));
}

export type ProductProfitabilityItem = {
  name: string;
  avgPrice: number;
  estCost: number;
  salesQty: number;
  marginRate: number;
};

type RawProductRow = ProductProfitabilityItem & { month: string };

function abcAnalysisDbId(tenant: TenantKey): string {
  if (tenant === "demo") return (process.env.NOTION_DEMO_ABC_ANALYSIS_DB_ID || "").trim();
  return (process.env.NOTION_OOTSUKI_ABC_ANALYSIS_DB_ID || "").trim();
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const rawCache = new Map<string, { expiresAt: number; rows: RawProductRow[] }>();

/** ABC分析DBの全行を対象月付きで取得する（内部用、月ごとのフィルタ前）。 */
async function getAllProductRows(tenant: TenantKey): Promise<RawProductRow[]> {
  const dbId = abcAnalysisDbId(tenant);
  if (!dbId) return [];

  const cached = rawCache.get(tenant);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return [];

  const pages = await queryDatabaseAllWithToken(config.notionToken, dbId, {}).catch(() => null);
  if (!pages) return [];

  const rows: RawProductRow[] = [];
  for (const page of pages) {
    const name = getPropertyText(page.properties, PRODUCT_NAME_ALIASES);
    const avgPrice = getPropertyNumber(page.properties, AVG_PRICE_ALIASES);
    const estCost = getPropertyNumber(page.properties, EST_COST_ALIASES);
    const salesQty = getPropertyNumber(page.properties, SALES_QTY_ALIASES) ?? 0;
    const month = getPropertyText(page.properties, MONTH_ALIASES) || "不明";
    // 想定原価が0円の行はレジ集計上のダミー行（税区分・LINEクーポン等）である可能性が高いため除外する。
    if (!name || !avgPrice || avgPrice <= 0 || !estCost || estCost <= 0) continue;

    const marginRate = Math.round((1 - estCost / avgPrice) * 1000) / 10;
    rows.push({ name, avgPrice, estCost, salesQty, marginRate, month });
  }

  rawCache.set(tenant, { expiresAt: Date.now() + CACHE_TTL_MS, rows });
  return rows;
}

/** ABC分析DBに保存されている対象月の一覧（新しい順）を返す。 */
export async function getAvailableProductMonths(tenant: TenantKey): Promise<string[]> {
  const rows = await getAllProductRows(tenant);
  return Array.from(new Set(rows.map((row) => row.month))).sort((a, b) => b.localeCompare(a));
}

/**
 * ABC分析DB（商品別売上・想定原価・平均単価）から、商品ごとの粗利率を計算して返す。
 * month を省略すると、保存されている中で最新の対象月のデータを使う。
 */
export async function getProductProfitability(tenant: TenantKey, month?: string): Promise<ProductProfitabilityItem[]> {
  const rows = await getAllProductRows(tenant);
  if (rows.length === 0) return [];

  const targetMonth = month ?? (await getAvailableProductMonths(tenant))[0];
  const byName = new Map<string, ProductProfitabilityItem>();
  for (const row of rows) {
    if (row.month !== targetMonth) continue;
    const existing = byName.get(row.name);
    if (existing) {
      existing.salesQty += row.salesQty;
      continue;
    }
    byName.set(row.name, { name: row.name, avgPrice: row.avgPrice, estCost: row.estCost, salesQty: row.salesQty, marginRate: row.marginRate });
  }

  return Array.from(byName.values());
}

/**
 * AI施策生成プロンプトに渡す「粗利率が高く、かつ一定数売れている商品」の要約（最新月のみ）。
 * ドリンク・割り材は除外し、フードメニューのみを対象にする。
 */
export async function getProductRecommendationSummaryForPrompt(tenant: TenantKey): Promise<string> {
  const items = await getProductProfitability(tenant);
  if (items.length === 0) return "（商品別売上・原価データは未接続、または取得に失敗しました）";

  const foodItems = items.filter((item) => isLikelyFood(item.name) && item.salesQty >= 5);
  const ranked = [...foodItems].sort((a, b) => b.marginRate - a.marginRate).slice(0, 10);

  if (ranked.length === 0) return "（条件に合うフードメニューが見つかりませんでした）";

  const lines = ranked.map(
    (item) =>
      `- ${item.name}: 粗利率${item.marginRate}%（売価${item.avgPrice}円/原価${item.estCost}円）, 販売実績${item.salesQty}件`,
  );

  return [
    "粗利率が高く、かつ一定数売れているフードメニュー（ドリンク・割り材を除く、粗利率が高い順）:",
    ...lines,
  ].join("\n");
}

// 原価がかかっているのに販売数量がこの件数以下の商品を「見直し候補」とみなす（ABC-Zランク相当）。
const DEAD_STOCK_SALES_QTY_THRESHOLD = 2;

/**
 * AI施策生成プロンプトに渡す「原価がかかっているのに、ほとんど売れていない商品」の要約（最新月のみ）。
 * ABC-Z分析の死に筋（Zランク）に相当し、メニューカット・原価見直し・値付け変更の判断材料になる。
 */
export async function getDeadStockSummaryForPrompt(tenant: TenantKey): Promise<string> {
  const items = await getProductProfitability(tenant);
  if (items.length === 0) return "（商品別売上・原価データは未接続、または取得に失敗しました）";

  const candidates = items
    .filter((item) => isLikelyFood(item.name) && item.salesQty <= DEAD_STOCK_SALES_QTY_THRESHOLD)
    .sort((a, b) => a.salesQty - b.salesQty)
    .slice(0, 10);

  if (candidates.length === 0) return "（見直し候補となるフードメニューは見つかりませんでした）";

  const lines = candidates.map(
    (item) =>
      `- ${item.name}: 販売実績${item.salesQty}件（売価${item.avgPrice}円/原価${item.estCost}円、粗利率${item.marginRate}%）`,
  );

  return [
    "販売数量が極端に少ない見直し候補フードメニュー（死に筋。メニューカット・原価見直し・値付け変更の材料）:",
    ...lines,
  ].join("\n");
}

export type ProductInsightsMonth = {
  month: string;
  topMargin: ProductProfitabilityItem[];
  deadStock: ProductProfitabilityItem[];
};

/** ダッシュボード表示用: 対象月ごとに粗利率TOP10・見直し候補TOP10をまとめて返す。 */
export async function getProductInsightsMonths(tenant: TenantKey): Promise<ProductInsightsMonth[]> {
  const months = await getAvailableProductMonths(tenant);
  const results: ProductInsightsMonth[] = [];

  for (const month of months) {
    const items = await getProductProfitability(tenant, month);
    const foodItems = items.filter((item) => isLikelyFood(item.name));

    const topMargin = [...foodItems]
      .filter((item) => item.salesQty >= 5)
      .sort((a, b) => b.marginRate - a.marginRate)
      .slice(0, 10);

    const deadStock = [...foodItems]
      .filter((item) => item.salesQty <= DEAD_STOCK_SALES_QTY_THRESHOLD)
      .sort((a, b) => a.salesQty - b.salesQty)
      .slice(0, 10);

    results.push({ month, topMargin, deadStock });
  }

  return results;
}
