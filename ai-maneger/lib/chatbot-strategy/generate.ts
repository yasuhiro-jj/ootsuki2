/**
 * AI Manager × チャットボット 自動おすすめ：販売戦略の生成。
 *
 * 数値は ABC分析DB の値だけを使い、LLM は使わない（事実を作らないため）。
 * データが古い・足りない場合は戦略を出さず failed を返す。
 */

import {
  getAvailableProductMonths,
  getProductProfitability,
  isLikelyFood,
  type ProductProfitabilityItem,
} from "@/lib/marketing/product-insights";
import type { TenantKey } from "@/lib/tenant-config/types";
import {
  buildMenuIndex,
  getMenuEntries,
  matchMenuEntry,
  normalizeProductName,
  type MenuEntry,
} from "./menu-match";

export const SEGMENT_SIGNATURE = "看板";
export const SEGMENT_GROWTH = "育成";
export const SEGMENT_BEST_SELLER = "売れ筋";
export const SEGMENT_HIGH_MARGIN = "高粗利";

/** 既定値。CHATBOT_STRATEGY_MAX_PRODUCTS で変更できる。 */
export const DEFAULT_MAX_PRODUCTS = 5;
/** 戦略の有効期間（時間）。夜間実行が止まれば自動で期限切れになる。 */
export const VALID_HOURS = 36;
/** 対象月がこの月数より古い場合は中止する。 */
const MAX_MONTH_AGE = 2;

const HIGH_PERCENTILE = 0.7;
const LOW_QTY_PERCENTILE = 0.5;

const CUSTOMER_REASON_MAX_LENGTH = 60;
const FALLBACK_REASON_POPULAR = "よくご注文いただいている一品です。";
const FALLBACK_REASON_RECOMMENDED = "当店のおすすめの一品です。";

export type StrategyProduct = {
  product_id: string;
  product_name: string;
  priority: number;
  reason: string;
  customer_reason: string;
  gross_margin_rank: number;
  sales_qty_rank: number;
  candidate_count: number;
  segment: string;
  max_suggestions: number;
};

export type StrategySourceSummary = {
  target_month: string;
  abc_row_count: number;
  candidate_count: number;
  menu_unmatched_count: number;
  excluded_by_menu_flag_count: number;
  excluded_by_list_count: number;
  daily_sales_ok: boolean;
  daily_sales_checked_date: string;
  generated_at: string;
};

export type GenerateSuccess = {
  ok: true;
  strategyId: string;
  payload: {
    strategy_id: string;
    name: string;
    active: boolean;
    valid_from: string;
    valid_until: string;
    sales_goal: string;
    max_suggestions_per_session: number;
    generated_by: string;
    priority_products: StrategyProduct[];
  };
  sourceSummary: StrategySourceSummary;
  validFrom: string;
  validUntil: string;
};

export type GenerateFailure = {
  ok: false;
  reason: string;
  sourceSummary: Partial<StrategySourceSummary>;
};

export type GenerateResult = GenerateSuccess | GenerateFailure;

export type ExclusionEntry = { menuPageId?: string | null; productName?: string | null };

export type GenerateOptions = {
  tenant: TenantKey;
  now?: Date;
  maxProducts?: number;
  exclusions?: ExclusionEntry[];
  /** テスト用の差し替え口。未指定なら実データを読む。 */
  loadProducts?: (tenant: TenantKey, month: string) => Promise<ProductProfitabilityItem[]>;
  loadMonths?: (tenant: TenantKey) => Promise<string[]>;
  loadMenuEntries?: () => Promise<MenuEntry[]>;
  loadDailySalesStatus?: (now: Date) => Promise<{ ok: boolean; checkedDate: string }>;
};

function monthAgeInMonths(month: string, now: Date): number | null {
  const matched = /^(\d{4})-(\d{2})/.exec(month.trim());
  if (!matched) return null;
  const year = Number(matched[1]);
  const monthIndex = Number(matched[2]) - 1;
  return (
    (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() - monthIndex)
  );
}

/** お客様向けの一文。粗利・原価・数値を出さない。 */
export function buildCustomerReason(entry: MenuEntry, segment: string): string {
  const source = (entry.recommendation || entry.oneLiner || "").trim();
  const cleaned = source.replace(/\s+/g, " ").slice(0, CUSTOMER_REASON_MAX_LENGTH);
  if (cleaned && !containsForbiddenExpression(cleaned)) {
    return cleaned;
  }
  return segment === SEGMENT_SIGNATURE || segment === SEGMENT_BEST_SELLER
    ? FALLBACK_REASON_POPULAR
    : FALLBACK_REASON_RECOMMENDED;
}

const FORBIDDEN_WORDS = ["粗利", "原価", "利益", "マージン", "仕入"];

/** お客様向けの文に出してはいけない表現・数値が含まれるか。 */
export function containsForbiddenExpression(text: string): boolean {
  if (FORBIDDEN_WORDS.some((word) => text.includes(word))) return true;
  if (/[0-9０-９]/.test(text)) return true;
  return false;
}

function buildInternalReason(
  item: ProductProfitabilityItem,
  marginRank: number,
  qtyRank: number,
  candidateCount: number,
  segment: string,
  month: string,
): string {
  return (
    `${month} 粗利率 ${item.marginRate}%（${candidateCount}品中 ${marginRank}位）、` +
    `売上数量 ${item.salesQty}件（${candidateCount}品中 ${qtyRank}位）、区分：${segment}`
  );
}

function classify(marginPct: number, qtyPct: number): string | null {
  if (marginPct >= HIGH_PERCENTILE && qtyPct >= HIGH_PERCENTILE) return SEGMENT_SIGNATURE;
  if (marginPct >= HIGH_PERCENTILE && qtyPct < LOW_QTY_PERCENTILE) return SEGMENT_GROWTH;
  if (qtyPct >= HIGH_PERCENTILE) return SEGMENT_BEST_SELLER;
  if (marginPct >= HIGH_PERCENTILE) return SEGMENT_HIGH_MARGIN;
  return null;
}

function buildExclusionMatchers(exclusions: ExclusionEntry[]) {
  const pageIds = new Set<string>();
  const names = new Set<string>();
  for (const entry of exclusions) {
    if (entry.menuPageId) pageIds.add(String(entry.menuPageId).replace(/-/g, ""));
    if (entry.productName) names.add(normalizeProductName(entry.productName));
  }
  return { pageIds, names };
}

/** 対象月の商品データから、チャットボットへ渡す販売戦略を組み立てる。 */
export async function generateChatbotStrategy(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const now = options.now ?? new Date();
  const maxProducts = options.maxProducts ?? DEFAULT_MAX_PRODUCTS;
  const loadMonths = options.loadMonths ?? getAvailableProductMonths;
  const loadProducts = options.loadProducts ?? getProductProfitability;
  const loadMenuEntries = options.loadMenuEntries ?? (() => getMenuEntries());

  const months = await loadMonths(options.tenant);
  const targetMonth = months[0];
  if (!targetMonth) {
    return { ok: false, reason: "abc_analysis_empty", sourceSummary: {} };
  }

  const age = monthAgeInMonths(targetMonth, now);
  if (age === null || age > MAX_MONTH_AGE) {
    return {
      ok: false,
      reason: "abc_analysis_stale",
      sourceSummary: { target_month: targetMonth },
    };
  }

  const rows = await loadProducts(options.tenant, targetMonth);
  const foodRows = rows.filter((row) => isLikelyFood(row.name));
  if (foodRows.length === 0) {
    return {
      ok: false,
      reason: "no_food_candidates",
      sourceSummary: { target_month: targetMonth, abc_row_count: rows.length },
    };
  }

  const menuIndex = buildMenuIndex(await loadMenuEntries());
  const { pageIds: excludedPageIds, names: excludedNames } = buildExclusionMatchers(
    options.exclusions ?? [],
  );

  let menuUnmatched = 0;
  let excludedByMenuFlag = 0;
  let excludedByList = 0;

  const matched: Array<{ item: ProductProfitabilityItem; entry: MenuEntry }> = [];
  for (const item of foodRows) {
    const entry = matchMenuEntry(menuIndex, item.name);
    if (!entry) {
      menuUnmatched += 1;
      continue;
    }
    if (!entry.recommendable) {
      excludedByMenuFlag += 1;
      continue;
    }
    if (
      excludedPageIds.has(entry.pageId) ||
      excludedNames.has(normalizeProductName(entry.name))
    ) {
      excludedByList += 1;
      continue;
    }
    matched.push({ item, entry });
  }

  const sourceSummary: StrategySourceSummary = {
    target_month: targetMonth,
    abc_row_count: rows.length,
    candidate_count: matched.length,
    menu_unmatched_count: menuUnmatched,
    excluded_by_menu_flag_count: excludedByMenuFlag,
    excluded_by_list_count: excludedByList,
    daily_sales_ok: false,
    daily_sales_checked_date: "",
    generated_at: now.toISOString(),
  };

  if (options.loadDailySalesStatus) {
    try {
      const status = await options.loadDailySalesStatus(now);
      sourceSummary.daily_sales_ok = status.ok;
      sourceSummary.daily_sales_checked_date = status.checkedDate;
    } catch {
      sourceSummary.daily_sales_ok = false;
    }
  }

  if (matched.length === 0) {
    return { ok: false, reason: "no_recommendable_products", sourceSummary };
  }

  const candidateCount = matched.length;
  const byMargin = [...matched].sort((a, b) => b.item.marginRate - a.item.marginRate);
  const byQty = [...matched].sort((a, b) => b.item.salesQty - a.item.salesQty);
  const marginRanks = new Map(byMargin.map((entry, index) => [entry.item.name, index + 1]));
  const qtyRanks = new Map(byQty.map((entry, index) => [entry.item.name, index + 1]));
  const span = Math.max(candidateCount - 1, 1);

  const ranked = matched
    .map(({ item, entry }) => {
      const marginRank = marginRanks.get(item.name) ?? candidateCount;
      const qtyRank = qtyRanks.get(item.name) ?? candidateCount;
      const marginPct = 1 - (marginRank - 1) / span;
      const qtyPct = 1 - (qtyRank - 1) / span;
      const segment = classify(marginPct, qtyPct);
      return { item, entry, marginRank, qtyRank, marginPct, qtyPct, segment };
    })
    .filter((candidate) => candidate.segment !== null)
    .sort((a, b) => b.marginPct + b.qtyPct - (a.marginPct + a.qtyPct));

  const scored = ranked.slice(0, maxProducts);

  // 粗利・売れ行きの合計で並べると看板商品が上位を独占し、「粗利は高いがまだ
  // 売れていない」育成商品が常に外れてしまう。最後の1枠は育成商品に充てる。
  if (
    maxProducts >= 2 &&
    scored.length === maxProducts &&
    !scored.some((candidate) => candidate.segment === SEGMENT_GROWTH)
  ) {
    const bestGrowth = ranked.find((candidate) => candidate.segment === SEGMENT_GROWTH);
    if (bestGrowth) {
      scored[scored.length - 1] = bestGrowth;
    }
  }

  if (scored.length === 0) {
    return { ok: false, reason: "no_segment_matched", sourceSummary };
  }

  const priorityStep = scored.length > 1 ? 40 / (scored.length - 1) : 0;
  const priorityProducts: StrategyProduct[] = scored.map((candidate, index) => {
    const segment = candidate.segment as string;
    return {
      product_id: candidate.entry.pageId,
      product_name: candidate.entry.name,
      priority: Math.round(90 - priorityStep * index),
      reason: buildInternalReason(
        candidate.item,
        candidate.marginRank,
        candidate.qtyRank,
        candidateCount,
        segment,
        targetMonth,
      ),
      customer_reason: buildCustomerReason(candidate.entry, segment),
      gross_margin_rank: candidate.marginRank,
      sales_qty_rank: candidate.qtyRank,
      candidate_count: candidateCount,
      segment,
      max_suggestions: 1,
    };
  });

  const validFrom = now.toISOString();
  const validUntil = new Date(now.getTime() + VALID_HOURS * 60 * 60 * 1000).toISOString();
  const strategyId = `auto_${options.tenant}_${validFrom.slice(0, 10).replace(/-/g, "")}`;

  return {
    ok: true,
    strategyId,
    validFrom,
    validUntil,
    sourceSummary,
    payload: {
      strategy_id: strategyId,
      name: `AI Manager 自動おすすめ（${targetMonth}）`,
      active: true,
      valid_from: validFrom,
      valid_until: validUntil,
      sales_goal: "粗利と売れ筋にもとづくおすすめ商品の提示",
      max_suggestions_per_session: 1,
      generated_by: "ai_manager_auto",
      priority_products: priorityProducts,
    },
  };
}
