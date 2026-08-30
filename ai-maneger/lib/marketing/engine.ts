import { generateReply } from "@/lib/agent-chat";
import { formatMetricsForPrompt } from "@/lib/marketing/metrics";
import type {
  MarketingActionEvidence,
  MarketingActionInput,
  MarketingActionPriority,
  MarketingChannel,
  MarketingChannelMetrics,
  MarketingGoal,
  MarketingStore,
  MarketingAction,
  MarketingActionExecution,
} from "@/types/marketing";

const JSON_INSTRUCTION = `次のJSONだけを返してください。Markdownや説明文は禁止です。
{
  "diagnosis": "店舗目標、Instagram、GBP、過去施策から見た短い診断",
  "actions": [
    {
      "title": "施策名",
      "reason": "この施策を行う理由",
      "evidence": [
        {
          "metric": "根拠にした指標名",
          "currentValue": 0,
          "previousValue": 0,
          "changeRate": 0,
          "explanation": "根拠の説明"
        }
      ],
      "target_channel": "instagram または gbp または canva または multi",
      "content_theme": "投稿テーマ",
      "priority": "high または medium または low",
      "target_kpi": "改善したいKPI",
      "recommended_action": "既存アプリで実行する具体アクション"
    }
  ]
}
actionsは2から4件。完全自動投稿はせず、人間承認を前提に提案してください。`;

function normalizeChannel(value: unknown): MarketingChannel {
  if (value === "gbp" || value === "canva" || value === "chatbot" || value === "multi") return value;
  return "instagram";
}

function normalizePriority(value: unknown): MarketingActionPriority {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeEvidence(value: unknown): MarketingActionEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      metric: String(item.metric || "").trim(),
      currentValue: typeof item.currentValue === "number" ? item.currentValue : undefined,
      previousValue: typeof item.previousValue === "number" ? item.previousValue : undefined,
      changeRate: typeof item.changeRate === "number" ? item.changeRate : undefined,
      explanation: String(item.explanation || "").trim(),
    }))
    .filter((item) => item.metric || item.explanation);
}

export function formatMarketingGoalsForPrompt(goals: MarketingGoal[]) {
  if (goals.length === 0) return "- 登録済みのマーケティング目標なし";
  return goals
    .map((goal) => {
      const target =
        typeof goal.targetValue === "number" ? ` target=${goal.targetValue}${goal.unit || ""}` : "";
      const current =
        typeof goal.currentValue === "number" ? ` current=${goal.currentValue}${goal.unit || ""}` : "";
      return `- ${goal.title} (${goal.goalType}, ${goal.status})${target}${current}`;
    })
    .join("\n");
}

export function formatPastActionsForPrompt(actions: MarketingAction[], executions: MarketingActionExecution[]) {
  if (actions.length === 0) return "- 過去施策なし";
  return actions
    .slice(0, 10)
    .map((action) => {
      const execution = executions.find((item) => item.actionId === action.id);
      return [
        `- ${action.title}`,
        `  status=${action.status}, approval=${action.approvalStatus}, channel=${action.targetChannel}`,
        `  targetKpi=${action.targetKpi}`,
        execution?.resultSummary ? `  result=${execution.resultSummary}` : "",
        action.evaluation?.summary ? `  aiEvaluation=${String(action.evaluation.summary)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function buildMarketingActionPrompt(params: {
  store: MarketingStore;
  goals: MarketingGoal[];
  metricsSnapshot: MarketingChannelMetrics[];
  pastActions: MarketingAction[];
  executions: MarketingActionExecution[];
}) {
  return [
    "AI Managerを店舗マーケティング司令塔として使います。",
    "店舗目標、Instagram指標、GBP指標、過去施策、過去結果から次に実行する施策を生成してください。",
    "Canva、Instagram、GBPの各アプリは独立したままです。AI Managerは判断、承認、履歴管理、実行指示を担います。",
    "",
    `[店舗]\nid=${params.store.id}\nname=${params.store.name}\ninstagramAccountId=${params.store.instagramAccountId || "未設定"}\ngbpLocationId=${params.store.gbpLocationId || "未設定"}\ncanvaBrandId=${params.store.canvaBrandId || "未設定"}`,
    "",
    "[MarketingGoal]",
    formatMarketingGoalsForPrompt(params.goals),
    "",
    "[Instagram / GBP 指標]",
    formatMetricsForPrompt(params.metricsSnapshot),
    "",
    "[過去施策 / 実行結果]",
    formatPastActionsForPrompt(params.pastActions, params.executions),
    "",
    "[将来追加予定の入力]",
    "- 過去投稿: interface準備中",
    "- 口コミ: interface準備中",
  ].join("\n");
}

export function parseGeneratedMarketingActions(reply: string): { diagnosis: string; actions: MarketingActionInput[] } {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AIのJSONを読み取れませんでした");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const actions = rawActions
    .map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      title: String(item.title || "").trim(),
      reason: String(item.reason || "").trim(),
      evidence: normalizeEvidence(item.evidence),
      targetChannel: normalizeChannel(item.target_channel),
      contentTheme: String(item.content_theme || "").trim(),
      priority: normalizePriority(item.priority),
      targetKpi: String(item.target_kpi || "").trim(),
      recommendedAction: String(item.recommended_action || "").trim(),
    }))
    .filter(
      (item) =>
        item.title &&
        item.reason &&
        item.contentTheme &&
        item.targetKpi &&
        item.recommendedAction,
    )
    .slice(0, 4);

  if (actions.length === 0) throw new Error("保存できる施策が生成されませんでした");
  return {
    diagnosis: typeof parsed.diagnosis === "string" ? parsed.diagnosis : "",
    actions,
  };
}

export async function generateMarketingActions(params: {
  store: MarketingStore;
  goals: MarketingGoal[];
  metricsSnapshot: MarketingChannelMetrics[];
  pastActions: MarketingAction[];
  executions: MarketingActionExecution[];
}) {
  const reply = await generateReply({
    userMessage: buildMarketingActionPrompt(params),
    dashboardContext: "",
    agentInstruction:
      "あなたは店舗マーケティングの運用責任者です。目標達成に効く施策を優先し、根拠、承認前提、既存アプリで実行できる粒度を必ず含めてください。",
    jsonInstruction: JSON_INSTRUCTION,
  });
  return parseGeneratedMarketingActions(reply);
}
