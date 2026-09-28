import type { OsDashboardData } from "@/types/os";
import { osSampleData } from "@/mock/os-sample";

/**
 * ダッシュボードのデータ取得。
 * いまはサンプルを返す。実装時は下の TODO の順に置き換える（UI は変更不要）。
 *
 * TODO（Supabase / withTenant(tenantKey, ...) で取得）:
 *  - tasks      : SELECT * FROM tasks WHERE tenant_key=$1 AND meeting_date=$2 ORDER BY priority_score DESC LIMIT 5
 *  - panels     : metrics_snapshots（source 別の最新値＋前期間）＋ findings（status IN ('open','promoted')）
 *  - kpis       : metrics_snapshots(source='notion_sales', granularity in day/month)
 *  - agents     : agent_runs（agent_key 別の最新）＋ findings 件数 ＋ decisions の承認率
 *  - grokBots   : connectors(source_type='grok_bot') ＋ agent_runs(trigger='grok_bot')
 *  - timeline   : task_events ORDER BY created_at DESC LIMIT 20
 *  - decisions  : decisions ORDER BY decided_at DESC LIMIT 10
 *  - acceptance : decisions を agent_key × decision で集計（直近90日）
 *  - connectors : connectors
 *  - isSample   : 上記がすべて実データになったら false
 */
export async function getOsDashboardData(tenantKey: string): Promise<OsDashboardData> {
  void tenantKey;
  return osSampleData;
}
