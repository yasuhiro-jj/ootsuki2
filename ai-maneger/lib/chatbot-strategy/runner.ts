/** 自動おすすめ戦略の生成〜保存をまとめた実行口（cron と手動実行の共通処理）。 */

import { getKpiEntries } from "@/lib/notion/ootsuki";
import type { TenantKey } from "@/lib/tenant-config/types";
import { DEFAULT_MAX_PRODUCTS, generateChatbotStrategy } from "./generate";
import {
  getStrategyPublisher,
  listExclusions,
  recordGenerationFailure,
  type PublishMode,
} from "./publisher";

export type StrategyMode = "off" | "shadow" | "publish";

export function getStrategyMode(): StrategyMode {
  const raw = (process.env.CHATBOT_AUTO_STRATEGY_MODE || "off").trim().toLowerCase();
  if (raw === "shadow" || raw === "publish") return raw;
  return "off";
}

function getMaxProducts(): number {
  const raw = Number((process.env.CHATBOT_STRATEGY_MAX_PRODUCTS || "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_PRODUCTS;
  return Math.min(Math.trunc(raw), 10);
}

/**
 * 前日の日次売上が取り込まれているかを確認する（社内向けの補足情報のみ）。
 * 商品別の判定には使わないため、確認できなくても生成は止めない。
 */
async function loadDailySalesStatus(now: Date): Promise<{ ok: boolean; checkedDate: string }> {
  const target = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const entries = await getKpiEntries();
  const found = entries.find((entry) => entry.date === target);
  return { ok: Boolean(found && found.sales > 0), checkedDate: target };
}

export type RunResult = {
  ok: boolean;
  mode: StrategyMode;
  tenant: TenantKey;
  strategyId?: string;
  status?: string;
  reason?: string;
  message?: string;
  productCount?: number;
  sourceSummary?: Record<string, unknown>;
};

export async function runChatbotStrategyGeneration(input: {
  tenant: TenantKey;
  now?: Date;
}): Promise<RunResult> {
  const mode = getStrategyMode();
  if (mode === "off") {
    return {
      ok: false,
      mode,
      tenant: input.tenant,
      reason: "mode_off",
      message: "CHATBOT_AUTO_STRATEGY_MODE が off のため生成しません。",
    };
  }

  const exclusions = await listExclusions(input.tenant).catch((error) => {
    console.error("[chatbot-strategy] failed to load exclusions", error);
    return null;
  });
  if (exclusions === null) {
    // 除外リストを読めないまま生成すると、出してはいけない商品を出す恐れがある。
    return {
      ok: false,
      mode,
      tenant: input.tenant,
      reason: "exclusions_unavailable",
      message: "除外リストを取得できなかったため中止しました。",
    };
  }

  const result = await generateChatbotStrategy({
    tenant: input.tenant,
    now: input.now,
    maxProducts: getMaxProducts(),
    exclusions: exclusions.map((row) => ({
      menuPageId: row.menuPageId,
      productName: row.productName,
    })),
    loadDailySalesStatus,
  });

  if (!result.ok) {
    await recordGenerationFailure({
      tenant: input.tenant,
      reason: result.reason,
      sourceSummary: result.sourceSummary,
    });
    return {
      ok: false,
      mode,
      tenant: input.tenant,
      reason: result.reason,
      sourceSummary: result.sourceSummary as Record<string, unknown>,
    };
  }

  const published = await getStrategyPublisher().publish({
    tenant: input.tenant,
    mode: mode as PublishMode,
    result,
  });

  if (!published.ok) {
    return {
      ok: false,
      mode,
      tenant: input.tenant,
      reason: "publish_failed",
      message: published.message,
      sourceSummary: result.sourceSummary as unknown as Record<string, unknown>,
    };
  }

  return {
    ok: true,
    mode,
    tenant: input.tenant,
    strategyId: published.strategyId,
    status: published.status,
    productCount: result.payload.priority_products.length,
    sourceSummary: result.sourceSummary as unknown as Record<string, unknown>,
  };
}
