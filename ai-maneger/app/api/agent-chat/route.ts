import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { resolveAgentProfile, OUTPUT_FORMAT_SCHEMAS } from "@/lib/agent-profiles";
import { generateReply, type ChatMessage } from "@/lib/agent-chat";
import {
  getAgentHubKnowledgeContext,
  getKnowledgeContextFromUrls,
  getRestaurantConsultingKnowledgeContext,
} from "@/lib/notion/restaurant-consulting";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";
import {
  getCurrentLineMessage,
  getKpiEntries,
  getLatestDecisionMemoEntries,
  getLatestWeeklyReviewEntries,
  getNotionInstructionsDocument,
  getOotsukiProjectOverview,
  getWeeklyActionPlan,
} from "@/lib/notion/ootsuki";
import type { KpiSnapshotEntry, MemoEntry } from "@/types/ootsuki";
import {
  aggregateWeek,
  attachWeekOverWeek,
  formatCount,
  formatPercentDelta,
  formatPercentValue,
  formatYen,
  isWeeklySummaryEntry,
} from "@/lib/ootsuki";
import type {
  AgentChatErrorResponse,
  AgentChatRequestBody,
  StructuredAgentResult,
  RestaurantConsultResult,
} from "@/types/chat";

export const runtime = "nodejs";

const sessionStore = new Map<string, ChatMessage[]>();

function sessionKey(tenant: string, sessionId: string) {
  return `${tenant}:${sessionId}`;
}

function getOrCreateSession(tenant: string, id?: string) {
  const candidateId = id || crypto.randomUUID();
  const key = sessionKey(tenant, candidateId);

  if (sessionStore.has(key)) {
    return { sessionId: candidateId, history: sessionStore.get(key)! };
  }

  const history: ChatMessage[] = [];
  sessionStore.set(key, history);
  return { sessionId: candidateId, history };
}

async function buildDashboardContext() {
  const [project, entries, memoEntries, reviewEntries, lineMessage, instructionsDoc] = await Promise.all([
    getOotsukiProjectOverview(),
    getKpiEntries(),
    getLatestDecisionMemoEntries(5),
    getLatestWeeklyReviewEntries(3),
    getCurrentLineMessage(),
    getNotionInstructionsDocument(),
  ]);
  const currentWeek = aggregateWeek(entries, new Date());
  const previousWeek = aggregateWeek(
    entries,
    new Date(new Date(`${currentWeek.weekStart}T00:00:00.000Z`).getTime() - 86400000),
  );
  const summary = attachWeekOverWeek(currentWeek, previousWeek);
  const weeklyActionPlan = await getWeeklyActionPlan(summary.weekStart, summary.weekEnd);
  const currentDailyEntries = entries
    .filter(
      (entry: KpiSnapshotEntry) =>
        !isWeeklySummaryEntry(entry) &&
        entry.weekStart === summary.weekStart &&
        entry.weekEnd === summary.weekEnd,
    )
    .slice(0, 7);

  return [
    `案件名: ${project.name}`,
    `KPI目標: ${project.kpiTarget || "未設定"}`,
    `対象週: ${summary.weekStart}〜${summary.weekEnd}`,
    `週次売上: ${formatYen(summary.sales)} (前週比 ${formatPercentDelta(summary.salesWoW)})`,
    `週次客数: ${formatCount(summary.customers)} (前週比 ${formatPercentDelta(summary.customersWoW)})`,
    `週次客単価: ${formatYen(summary.averageSpend)} (前週比 ${formatPercentDelta(summary.averageSpendWoW)})`,
    `週次粗利率: ${formatPercentValue(summary.grossMarginRate)} (前週比 ${formatPercentDelta(summary.grossMarginRateWoW)})`,
    `週次LINE登録数: ${formatCount(summary.lineRegistrations)} (前週比 ${formatPercentDelta(summary.lineRegistrationsWoW)})`,
    `週次LINE経由来店数: ${formatCount(summary.lineVisits)} (前週比 ${formatPercentDelta(summary.lineVisitsWoW)})`,
    `入力済み日数: ${summary.totalDays}`,
    "",
    "【今週の実行項目】",
    ...(weeklyActionPlan?.actions.length
      ? weeklyActionPlan.actions.map((item) => `- ${item}`)
      : ["- 未登録"]),
    "",
    "【今週の日次入力】",
    ...currentDailyEntries.map(
      (entry: KpiSnapshotEntry) =>
        `${entry.title}: 売上 ${formatYen(entry.sales)}, 客数 ${formatCount(entry.customers)}, 客単価 ${formatYen(entry.averageSpend)}, 粗利率 ${formatPercentValue(entry.grossMarginRate)}, LINE登録数 ${formatCount(entry.lineRegistrations)}, LINE経由来店数 ${formatCount(entry.lineVisits)}, メモ ${entry.notes || "なし"}`,
    ),
    "",
    "【最新判断メモ】",
    ...memoEntries.map(
      (entry: MemoEntry) =>
        `${entry.title} (${entry.updatedAt}): 要点 ${entry.summary || "なし"} / 関連数字 ${entry.relatedNumbers || "なし"} / 次アクション ${entry.nextAction || "なし"}`,
    ),
    "",
    "【最新週次レビュー】",
    ...reviewEntries.map(
      (entry: MemoEntry) =>
        `${entry.title} (${entry.updatedAt}): 振り返り ${entry.summary || "なし"} / 関連数字 ${entry.relatedNumbers || "なし"} / 次アクション ${entry.nextAction || "なし"}`,
    ),
    "",
    `【LINE配信文】\n${lineMessage.title}\n${lineMessage.body}`,
    "",
    "【運用指示書】",
    instructionsDoc.configured
      ? `${instructionsDoc.title}\n${instructionsDoc.body}`
      : instructionsDoc.body,
  ].join("\n");
}

function tryParseStructured(reply: string, outputFormat: string): StructuredAgentResult | null {
  try {
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    if (outputFormat === "sales-analysis") {
      return {
        type: "sales-analysis",
        data: {
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
          facts: Array.isArray(parsed.facts) ? (parsed.facts as string[]) : [],
          hypotheses: Array.isArray(parsed.hypotheses) ? (parsed.hypotheses as string[]) : [],
          nextActions: Array.isArray(parsed.nextActions) ? (parsed.nextActions as string[]) : [],
        },
      };
    }

    if (outputFormat === "line-proposal") {
      return {
        type: "line-proposal",
        data: {
          title: typeof parsed.title === "string" ? parsed.title : "",
          body: typeof parsed.body === "string" ? parsed.body : "",
          target: typeof parsed.target === "string" ? parsed.target : "",
          goal: typeof parsed.goal === "string" ? parsed.goal : "",
        },
      };
    }

    if (outputFormat === "weekly-review") {
      return {
        type: "weekly-review",
        data: {
          highlights: Array.isArray(parsed.highlights) ? (parsed.highlights as string[]) : [],
          issues: Array.isArray(parsed.issues) ? (parsed.issues as string[]) : [],
          actions: Array.isArray(parsed.actions) ? (parsed.actions as string[]) : [],
        },
      };
    }

    if (outputFormat === "restaurant-consult") {
      return {
        type: "restaurant-consult",
        data: {
          currentAssessment: typeof parsed.currentAssessment === "string" ? parsed.currentAssessment : "",
          issues: Array.isArray(parsed.issues) ? (parsed.issues as string[]) : [],
          improvements: Array.isArray(parsed.improvements) ? (parsed.improvements as string[]) : [],
          firstStep: typeof parsed.firstStep === "string" ? parsed.firstStep : "",
        } satisfies RestaurantConsultResult,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  let body: AgentChatRequestBody;
  try {
    body = (await request.json()) as AgentChatRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_error",
        message: "JSON の形式が正しくありません",
      } satisfies AgentChatErrorResponse,
      { status: 400 },
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const agentName = typeof body.agentName === "string" ? body.agentName.trim() : "";
  const agentRole = typeof body.agentRole === "string" ? body.agentRole.trim() : "";
  if (!message) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_error",
        message: "message が空です",
      } satisfies AgentChatErrorResponse,
      { status: 400 },
    );
  }

  const tenantConfig = await getActiveTenantNotionConfig();
  const notionToken = tenantConfig.notionToken;
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!notionToken || !openaiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_config",
        message: "NOTION_API_KEY と OPENAI_API_KEY を .env.local に設定してください。",
      } satisfies AgentChatErrorResponse,
      { status: 503 },
    );
  }

  const { sessionId, history } = getOrCreateSession(
    access.tenant,
    typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : undefined,
  );

  try {
    const agentProfile = resolveAgentProfile(agentName, agentRole);
    const outputFormat = agentProfile.outputFormat;
    const jsonInstruction =
      outputFormat && outputFormat !== "text"
        ? OUTPUT_FORMAT_SCHEMAS[outputFormat]
        : undefined;

    const dashboardContext = await buildDashboardContext();
    const agentHubKnowledgeContext = await getAgentHubKnowledgeContext();
    const agentSpecificKnowledgeContext =
      agentProfile.knowledgeLabel && agentProfile.knowledgeEnvKey
        ? await getKnowledgeContextFromUrls(
            agentProfile.knowledgeLabel,
            process.env[agentProfile.knowledgeEnvKey]?.trim() || "",
          )
        : "";
    const restaurantKnowledgeContext = agentProfile.useRestaurantKnowledge
      ? await getRestaurantConsultingKnowledgeContext()
      : "";
    const fullContext = [
      dashboardContext,
      agentHubKnowledgeContext,
      agentSpecificKnowledgeContext,
      restaurantKnowledgeContext,
    ]
      .filter(Boolean)
      .join("\n\n");
    const agentScopedMessage =
      agentName || agentRole
        ? `${agentName ? `${agentName}として対応してください。` : ""}\n${agentRole ? `役割: ${agentRole}` : ""}\n\n依頼内容:\n${message}`.trim()
        : message;
    const reply = await generateReply({
      userMessage: agentScopedMessage,
      dashboardContext: fullContext,
      agentInstruction: agentProfile.expertInstruction,
      jsonInstruction,
      conversationHistory: history.slice(-20),
    });

    history.push({ role: "user", content: agentScopedMessage });
    history.push({ role: "assistant", content: reply });

    const structured =
      outputFormat && outputFormat !== "text"
        ? tryParseStructured(reply, outputFormat) ?? undefined
        : undefined;

    return NextResponse.json({
      ok: true,
      reply,
      sessionId,
      source: `${access.tenant}-dashboard-agent`,
      fallbackUsed: false,
      ...(structured ? { structured } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    console.error("[agent-chat]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "agent_failed",
        message,
      } satisfies AgentChatErrorResponse,
      { status: 502 },
    );
  }
}
