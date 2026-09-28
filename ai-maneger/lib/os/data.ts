import { getKpiEntries } from "@/lib/notion/ootsuki";
import { listOsDecisions } from "@/lib/os/decision-store";
import { applyStoredDecisions } from "@/lib/os/decisions";
import { applyNotionSales } from "@/lib/os/sales-kpis";
import type { OsDashboardData } from "@/types/os";
import { osSampleData } from "@/mock/os-sample";

/**
 * ダッシュボードのデータ取得。
 * いまはサンプルを返す。実装時は下の TODO の順に置き換える（UI は変更不要）。
 *
 * TODO（Supabase / withTenant(tenantKey, ...) で取得）:
 *  - tasks      : SELECT * FROM tasks WHERE tenant_key=$1 AND meeting_date=$2 ORDER BY priority_score DESC LIMIT 5
 *  - panels     : metrics_snapshots（source 別の最新値＋前期間）＋ findings（status IN ('open','promoted')）
 *  - kpis       : 日次売上は getKpiEntries()（Notion）。取れない日はサンプルのまま
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
  try {
    const entries = await getKpiEntries();
    data = applyNotionSales(sample, entries);
  } catch (error) {
    console.warn("[os] Notion の日次売上を読めなかったため、KPI はサンプルのまま表示します:", error);
  }
  try {
    const decisions = await listOsDecisions(tenantKey);
    return applyStoredDecisions(data, decisions);
  } catch (error) {
    console.warn("[os] 保存済みの判断を読めなかったため、サンプルの判断のまま表示します:", error);
    return data;
  }
}
