import { resolveWeekRange } from "@/lib/ootsuki";
import { getKpiEntries, getLatestDecisionMemoEntries, getWeeklyActionPlan } from "@/lib/notion/ootsuki";
import { listOsDecisions } from "@/lib/os/decision-store";
import { applyStoredDecisions } from "@/lib/os/decisions";
import { applyOperations, scrubUnconnectedSamples } from "@/lib/os/live-mode";
import { applyNotionReportOverlays } from "@/lib/os/notion-report";
import { loadNotionReportOverlay } from "@/lib/os/notion-report-sources";
import { applyNotionSales } from "@/lib/os/sales-kpis";
import { applyWebAnalyticsOverlays } from "@/lib/os/web-analytics";
import { loadWebAnalyticsBundle } from "@/lib/os/web-analytics-sources";
import type { TenantKey } from "@/lib/tenant-config/types";
import type { OsDashboardData } from "@/types/os";
import { osSampleData } from "@/mock/os-sample";

/**
 * ダッシュボードのデータ取得。
 * いまはサンプルを返す。実装時は下の TODO の順に置き換える（UI は変更不要）。
 *
 * TODO（Supabase / withTenant(tenantKey, ...) で取得）:
 *  - tasks      : SELECT * FROM tasks WHERE tenant_key=$1 AND meeting_date=$2 ORDER BY priority_score DESC LIMIT 5
 *  - panels     : metrics_snapshots（source 別の最新値＋前期間）＋ findings（status IN ('open','promoted')）
 *  - kpis       : 日次売上は getKpiEntries()（Notion）。ドリンク比率・原価率・FL・ピークは別DB。無い項目は未接続
 *  - agents     : agent_runs（agent_key 別の最新）＋ findings 件数 ＋ decisions の承認率
 *  - grokBots   : connectors(source_type='grok_bot') ＋ agent_runs(trigger='grok_bot')
 *  - timeline   : task_events ORDER BY created_at DESC LIMIT 20
 *  - decisions  : os_task_decisions（保存済みの承認・却下・保留を上書き）
 *  - acceptance : decisions を agent_key × decision で集計（直近90日）
 *  - connectors : connectors
 *  - isSample   : 上記がすべて実データになったら false
 */
export async function getOsDashboardData(tenantKey: string): Promise<OsDashboardData> {
  const sample = {
    ...osSampleData,
    tenant: { ...osSampleData.tenant, key: tenantKey },
  };
  let data = sample;
  let live = false;
  try {
    const entries = await getKpiEntries();
    const applied = applyNotionSales(data, entries);
    live = applied !== data;
    data = applied;
  } catch (error) {
    console.warn("[os] Notion の日次売上を読めなかったため、KPI はサンプルのまま表示します:", error);
  }
  if (live) {
    data = await applyLiveOperations(data);
    data = await applyReportSources(data, tenantKey);
    data = scrubUnconnectedSamples(data);
  }
  // 日次が取れなくても Notion の GSC/GA4 があれば SEO/アクセスだけ実績に差し替える（scrub の後）
  data = await applyWebAnalytics(data, tenantKey);
  try {
    const decisions = await listOsDecisions(tenantKey);
    return applyStoredDecisions(data, decisions);
  } catch (error) {
    console.warn("[os] 保存済みの判断を読めなかったため、サンプルの判断のまま表示します:", error);
    return data;
  }
}

function asTenantKey(tenantKey: string): TenantKey | null {
  if (tenantKey === "ootsuki" || tenantKey === "demo") return tenantKey;
  return null;
}

async function applyWebAnalytics(data: OsDashboardData, tenantKey: string) {
  const tenant = asTenantKey(tenantKey);
  if (!tenant) return data;
  try {
    const bundle = await loadWebAnalyticsBundle(tenant);
    return applyWebAnalyticsOverlays(data, bundle);
  } catch (error) {
    console.warn("[os] Notion の検索・アクセスを読めなかったため、SEO/GA4 は未接続のままにします:", error);
    return data;
  }
}

async function applyReportSources(data: OsDashboardData, tenantKey: string) {
  const tenant = asTenantKey(tenantKey);
  if (!tenant) return data;
  try {
    const overlay = await loadNotionReportOverlay(tenant);
    return applyNotionReportOverlays(data, overlay);
  } catch (error) {
    console.warn("[os] 時間帯・商品別・推移試算表を読めなかったため、その項目は未接続のままにします:", error);
    return data;
  }
}

async function applyLiveOperations(data: OsDashboardData) {
  try {
    const week = resolveWeekRange(data.businessDate);
    const [plan, memos] = await Promise.all([
      getWeeklyActionPlan(week.weekStart, week.weekEnd),
      getLatestDecisionMemoEntries(30),
    ]);
    const memoCount = memos.filter((memo) => {
      const day = (memo.date || memo.updatedAt || "").slice(0, 10);
      return day >= week.weekStart && day <= week.weekEnd;
    }).length;
    return applyOperations(
      data,
      plan
        ? {
            weekStart: plan.weekStart,
            weekEnd: plan.weekEnd,
            actions: plan.actions,
            updatedAt: plan.updatedAt || new Date().toISOString(),
          }
        : null,
      memoCount,
    );
  } catch (error) {
    console.warn("[os] 週次の実行項目を読めなかったため、売上以外は未接続のままにします:", error);
    return data;
  }
}
