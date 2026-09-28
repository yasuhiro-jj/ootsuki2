import type { OsDashboardData, Task } from "@/types/os";

export interface WeeklyOperationInput {
  weekStart: string;
  weekEnd: string;
  actions: string[];
  updatedAt: string;
}

function clearSampleMetric<T extends { origin: OsDashboardData["kpis"][number]["origin"]; value: string; sub?: string; delta?: number; deltaLabel?: string }>(
  metric: T,
): T {
  if (metric.origin !== "sample") return metric;
  return { ...metric, value: "未接続", sub: undefined, delta: undefined, deltaLabel: undefined, origin: "unavailable" };
}

function actionId(text: string) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `week-${hash.toString(16)}`;
}

/** Notion の週次実行項目と、今週の判断メモ件数を画面に載せる。 */
export function applyOperations(
  data: OsDashboardData,
  plan: WeeklyOperationInput | null,
  memoCount: number | null,
): OsDashboardData {
  const tasks = [...data.tasks];
  if (plan) {
    for (const action of plan.actions.slice(0, 4)) {
      const id = actionId(action);
      if (tasks.some((task) => task.id === id)) continue;
      const task: Task = {
        id,
        title: action,
        agentKey: "operations",
        state: "PROPOSED",
        severity: 2,
        priorityScore: 40,
        detectedAt: plan.updatedAt,
        whyNow: `${plan.weekStart}〜${plan.weekEnd} の実行項目です。`,
        proposal: "Notion の今週の実行項目です。完了の記録は週次の画面で行います。",
        executionMode: "manual",
        evidence: [{ metric: "週", current: `${plan.weekStart}〜${plan.weekEnd}`, origin: "actual", source: "Notion 週次実行項目" }],
        origin: "actual",
      };
      tasks.push(task);
    }
  }

  return {
    ...data,
    tasks,
    panels: data.panels.map((panel) => {
      if (panel.key !== "operations") return panel;
      return {
        ...panel,
        metrics: panel.metrics.map((metric) => {
          if (metric.key === "wk" && plan) {
            return { ...metric, value: `${plan.actions.length}件`, sub: `${plan.weekStart}〜${plan.weekEnd}`, origin: "actual" as const, delta: undefined };
          }
          if (metric.key === "memo" && memoCount !== null) {
            return { ...metric, label: "判断メモ（今週）", value: `${memoCount}件`, origin: "actual" as const, sub: undefined, delta: undefined };
          }
          return metric;
        }),
      };
    }),
  };
}

/**
 * 日次売上が取れたあとに呼ぶ。まだ接続していないサンプル数値を「未接続」にし、ダミーの仕事は外す。
 */
export function scrubUnconnectedSamples(data: OsDashboardData): OsDashboardData {
  const next: OsDashboardData = {
    ...data,
    isSample: false,
    health: {
      score: 0,
      label: "未算出",
      origin: "unavailable",
      breakdown: [],
    },
    kpis: data.kpis.map(clearSampleMetric),
    tasks: data.tasks.filter((task) => task.origin !== "sample"),
    panels: data.panels.map((panel) => ({
      ...panel,
      ...(panel.key === "sales_pos"
        ? { status: "grok_bot" as const, statusNote: "Grok Bot が USEN 管理画面から取得 → Notion 日次" }
        : {}),
      metrics: panel.metrics.map(clearSampleMetric),
      findings: panel.findings.filter((finding) => finding.origin !== "sample"),
    })),
    agents: data.agents.map((agent) => ({
      ...agent,
      findingsCount: agent.key === "finance" || agent.key === "sales" ? 1 : 0,
      acceptanceRate: undefined,
      proposedCount: undefined,
      lastRunAt: agent.key === "finance" || agent.key === "sales" || agent.key === "manager" ? data.generatedAt : undefined,
      state: agent.state === "planned" ? "planned" : agent.key === "finance" || agent.key === "sales" || agent.key === "manager" ? "ok" : "idle",
    })),
    grokBots: data.grokBots.map((bot) =>
      bot.key === "ai_manager_bot"
        ? {
            ...bot,
            role: "USEN管理画面から売上を直接取得し、Notionの日次へ保存",
            feeds: "売上・客数・客単価",
            state: "ok",
            findingsCount: 0,
            lastIngestAt: data.generatedAt,
          }
        : { ...bot, findingsCount: 0, lastIngestAt: undefined, state: "idle" },
    ),
    timeline: [],
    decisions: [],
    acceptance: data.acceptance.map((stat) => ({ ...stat, approved: 0, modified: 0, held: 0, rejected: 0 })),
    connectors: data.connectors.map((connector) => {
      if (connector.key === "usen") {
        return {
          ...connector,
          label: "USENレジ",
          status: "grok_bot" as const,
          via: "Grok Bot が USEN 管理画面を直接確認し、日次を Notion に保存",
          lastSyncAt: data.generatedAt,
        };
      }
      if (connector.key === "notion" || connector.status === "planned" || connector.status === "manual") {
        return connector;
      }
      return { ...connector, status: "not_connected" as const, lastSyncAt: undefined };
    }),
  };
  return next;
}
