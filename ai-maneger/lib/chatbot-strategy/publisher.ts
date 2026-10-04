/**
 * 生成した販売戦略の送り先。
 *
 * 既定は Supabase（案B）。チャットボットがそこから読む。
 * CEO の承認が得られず Supabase を使えない場合に備え、チャットボットの管理API
 * へ直接送る実装（案A）も同じインターフェースで差し替えられるようにしてある。
 */

import { withTenant } from "@/lib/db";
import type { TenantKey } from "@/lib/tenant-config/types";
import type { GenerateSuccess, StrategySourceSummary } from "./generate";

export type PublishMode = "shadow" | "publish";

export type PublishResult =
  | { ok: true; strategyId: string; status: string }
  | { ok: false; message: string };

export interface StrategyPublisher {
  publish(input: {
    tenant: TenantKey;
    mode: PublishMode;
    result: GenerateSuccess;
  }): Promise<PublishResult>;
}

/** 案B（既定）: Supabase の共有テーブルに書く。 */
export class SupabasePublisher implements StrategyPublisher {
  async publish(input: {
    tenant: TenantKey;
    mode: PublishMode;
    result: GenerateSuccess;
  }): Promise<PublishResult> {
    const status = input.mode === "publish" ? "published" : "shadow";
    try {
      await withTenant(input.tenant, async (client) => {
        if (status === "published") {
          // 直前の published は superseded にして、有効な戦略を1本に保つ。
          await client.query(
            `UPDATE chatbot_sales_strategies
                SET status = 'superseded'
              WHERE tenant_key = $1 AND status = 'published'`,
            [input.tenant],
          );
        }
        await client.query(
          `INSERT INTO chatbot_sales_strategies
             (tenant_key, strategy_id, status, payload, source_summary,
              valid_from, valid_until, generated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ai_manager_auto')
           ON CONFLICT (tenant_key, strategy_id) DO UPDATE
             SET status = EXCLUDED.status,
                 payload = EXCLUDED.payload,
                 source_summary = EXCLUDED.source_summary,
                 valid_from = EXCLUDED.valid_from,
                 valid_until = EXCLUDED.valid_until,
                 created_at = NOW()`,
          [
            input.tenant,
            input.result.strategyId,
            status,
            JSON.stringify(input.result.payload),
            JSON.stringify(input.result.sourceSummary),
            input.result.validFrom,
            input.result.validUntil,
          ],
        );
      });
      return { ok: true, strategyId: input.result.strategyId, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  }
}

/** 案A: チャットボットの管理API（POST /admin/ai-manager/sales-strategies）へ送る。 */
export class AdminApiPublisher implements StrategyPublisher {
  async publish(input: {
    tenant: TenantKey;
    mode: PublishMode;
    result: GenerateSuccess;
  }): Promise<PublishResult> {
    const baseUrl = (process.env.CHATBOT_ADMIN_API_URL || "").trim();
    const apiKey = (process.env.CHATBOT_ADMIN_API_KEY || "").trim();
    if (!baseUrl || !apiKey) {
      return { ok: false, message: "CHATBOT_ADMIN_API_URL / CHATBOT_ADMIN_API_KEY が未設定です" };
    }
    if (input.mode !== "publish") {
      // 管理APIには shadow の概念が無いため、publish 以外は送らない。
      return { ok: true, strategyId: input.result.strategyId, status: "shadow_not_sent" };
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/admin/ai-manager/sales-strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-API-Key": apiKey },
        body: JSON.stringify(input.result.payload),
      });
      if (!response.ok) {
        return { ok: false, message: `管理APIが ${response.status} を返しました` };
      }
      return { ok: true, strategyId: input.result.strategyId, status: "published" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  }
}

export function getStrategyPublisher(): StrategyPublisher {
  return (process.env.CHATBOT_STRATEGY_PUBLISHER || "supabase").trim() === "admin_api"
    ? new AdminApiPublisher()
    : new SupabasePublisher();
}

/** 生成できなかったことを記録する（戦略は出さない）。 */
export async function recordGenerationFailure(input: {
  tenant: TenantKey;
  reason: string;
  sourceSummary: Partial<StrategySourceSummary>;
}): Promise<void> {
  const now = new Date().toISOString();
  const strategyId = `failed_${input.tenant}_${now.slice(0, 19).replace(/[-:T]/g, "")}`;
  try {
    await withTenant(input.tenant, async (client) => {
      await client.query(
        `INSERT INTO chatbot_sales_strategies
           (tenant_key, strategy_id, status, payload, source_summary,
            valid_from, valid_until, generated_by)
         VALUES ($1, $2, 'failed', $3, $4, $5, $5, 'ai_manager_auto')
         ON CONFLICT (tenant_key, strategy_id) DO NOTHING`,
        [
          input.tenant,
          strategyId,
          JSON.stringify({ reason: input.reason }),
          JSON.stringify(input.sourceSummary),
          now,
        ],
      );
    });
  } catch (error) {
    console.error("[chatbot-strategy] failed to record failure", error);
  }
}

export type StrategyRow = {
  strategyId: string;
  status: string;
  payload: Record<string, unknown>;
  sourceSummary: Record<string, unknown>;
  validFrom: string;
  validUntil: string;
  createdAt: string;
};

/** 画面表示用に直近の戦略を取得する。 */
export async function listRecentStrategies(
  tenant: TenantKey,
  limit = 5,
): Promise<StrategyRow[]> {
  return withTenant(tenant, async (client) => {
    const result = await client.query(
      `SELECT strategy_id, status, payload, source_summary, valid_from, valid_until, created_at
         FROM chatbot_sales_strategies
        WHERE tenant_key = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [tenant, limit],
    );
    return result.rows.map((row) => ({
      strategyId: String(row.strategy_id),
      status: String(row.status),
      payload: row.payload ?? {},
      sourceSummary: row.source_summary ?? {},
      validFrom: row.valid_from ? new Date(row.valid_from).toISOString() : "",
      validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : "",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    }));
  });
}

export type ExclusionRow = {
  id: string;
  menuPageId: string | null;
  productName: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
};

export async function listExclusions(tenant: TenantKey): Promise<ExclusionRow[]> {
  return withTenant(tenant, async (client) => {
    const result = await client.query(
      `SELECT id, menu_page_id, product_name, reason, created_by, created_at
         FROM chatbot_recommendation_exclusions
        WHERE tenant_key = $1
        ORDER BY created_at DESC`,
      [tenant],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      menuPageId: row.menu_page_id ? String(row.menu_page_id) : null,
      productName: row.product_name ? String(row.product_name) : null,
      reason: String(row.reason ?? ""),
      createdBy: String(row.created_by ?? ""),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    }));
  });
}

export async function addExclusion(input: {
  tenant: TenantKey;
  menuPageId?: string | null;
  productName?: string | null;
  reason?: string;
  createdBy: string;
}): Promise<void> {
  await withTenant(input.tenant, async (client) => {
    await client.query(
      `INSERT INTO chatbot_recommendation_exclusions
         (tenant_key, menu_page_id, product_name, reason, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.tenant,
        input.menuPageId || null,
        input.productName || null,
        input.reason || "",
        input.createdBy,
      ],
    );
  });
}

export async function removeExclusion(tenant: TenantKey, id: string): Promise<void> {
  await withTenant(tenant, async (client) => {
    await client.query(
      `DELETE FROM chatbot_recommendation_exclusions WHERE tenant_key = $1 AND id = $2`,
      [tenant, id],
    );
  });
}
