import { getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";

const PRODUCT_NAME_ALIASES = ["商品名"];
const AVG_PRICE_ALIASES = ["平均単価"];
const EST_COST_ALIASES = ["想定原価"];
const SALES_QTY_ALIASES = ["売上数量"];

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

function abcAnalysisDbId(tenant: TenantKey): string {
  if (tenant === "demo") return (process.env.NOTION_DEMO_ABC_ANALYSIS_DB_ID || "").trim();
  return (process.env.NOTION_OOTSUKI_ABC_ANALYSIS_DB_ID || "").trim();
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; items: ProductProfitabilityItem[] }>();

/** ABC分析DB（商品別売上・想定原価・平均単価）から、商品ごとの粗利率を計算して返す。 */
export async function getProductProfitability(tenant: TenantKey): Promise<ProductProfitabilityItem[]> {
  const dbId = abcAnalysisDbId(tenant);
  if (!dbId) return [];

  const cached = cache.get(tenant);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return [];

  const pages = await queryDatabaseAllWithToken(config.notionToken, dbId, {}).catch(() => null);
  if (!pages) return [];

  const byName = new Map<string, ProductProfitabilityItem>();
  for (const page of pages) {
    const name = getPropertyText(page.properties, PRODUCT_NAME_ALIASES);
    const avgPrice = getPropertyNumber(page.properties, AVG_PRICE_ALIASES);
    const estCost = getPropertyNumber(page.properties, EST_COST_ALIASES);
    const salesQty = getPropertyNumber(page.properties, SALES_QTY_ALIASES) ?? 0;
    // 想定原価が0円の行はレジ集計上のダミー行（税区分・LINEクーポン等）である可能性が高いため除外する。
    if (!name || !avgPrice || avgPrice <= 0 || !estCost || estCost <= 0) continue;

    const marginRate = Math.round((1 - estCost / avgPrice) * 1000) / 10;
    const existing = byName.get(name);
    if (existing) {
      existing.salesQty += salesQty;
      continue;
    }
    byName.set(name, { name, avgPrice, estCost, salesQty, marginRate });
  }

  const items = Array.from(byName.values());
  cache.set(tenant, { expiresAt: Date.now() + CACHE_TTL_MS, items });
  return items;
}

/**
 * AI施策生成プロンプトに渡す「粗利率が高く、かつ一定数売れている商品」の要約。
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
