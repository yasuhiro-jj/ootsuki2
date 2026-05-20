import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { resolveAgentProfile, OUTPUT_FORMAT_SCHEMAS } from "@/lib/agent-profiles";
import {
  insertConversationLog,
  isTenantConfigStoreEnabled,
  searchSimilarConversations,
  searchSimilarDigests,
  updateConversationEmbedding,
} from "@/lib/tenant-config/repository";
import { generateEmbedding } from "@/lib/db/embeddings";
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
import { getAlwaysOnNotionReferenceContext } from "@/lib/notion/agent-context";
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

function isMonthlySummaryEntry(entry: KpiSnapshotEntry) {
  return entry.title.includes("月次売上");
}

function resolveYoY(current: number, previous: number | undefined, stored: number | undefined) {
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  if (typeof previous === "number" && previous > 0) {
    return ((current - previous) / previous) * 100;
  }
  return undefined;
}

function calculateAverageSpend(sales: number, customers: number) {
  return customers > 0 ? sales / customers : 0;
}

function buildSalesOverviewContext(entries: KpiSnapshotEntry[]) {
  const dailyEntries = entries
    .filter((entry): entry is KpiSnapshotEntry & { date: string } => Boolean(entry.date))
    .sort((left, right) => left.date.localeCompare(right.date));
  const weeklySummaryEntries = entries
    .filter((entry) => !entry.date && isWeeklySummaryEntry(entry))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  const monthlySummaryEntries = entries
    .filter((entry) => !entry.date && isMonthlySummaryEntry(entry))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));

  const monthKeys = Array.from(
    new Set([
      ...dailyEntries.map((entry) => entry.date.slice(0, 7)),
      ...weeklySummaryEntries.map((entry) => entry.weekStart.slice(0, 7)).filter(Boolean),
      ...monthlySummaryEntries.map((entry) => entry.weekStart.slice(0, 7)).filter(Boolean),
    ]),
  ).sort((left, right) => right.localeCompare(left));
  const selectedMonth = monthKeys[0];
  if (!selectedMonth) return "";

  const monthEntries = dailyEntries.filter((entry) => entry.date.startsWith(selectedMonth));
  const selectedMonthlySummary = monthlySummaryEntries.find((entry) => entry.weekStart.startsWith(selectedMonth));
  const previousYearMonthKey = `${String(Number(selectedMonth.slice(0, 4)) - 1)}${selectedMonth.slice(4)}`;
  const previousYearMonthSales =
    monthlySummaryEntries.find((entry) => entry.weekStart.startsWith(previousYearMonthKey))?.sales ||
    dailyEntries
      .filter((entry) => entry.date.startsWith(previousYearMonthKey))
      .reduce((sum, entry) => sum + entry.sales, 0);

  const monthlySales =
    selectedMonthlySummary?.sales ?? monthEntries.reduce((sum, entry) => sum + entry.sales, 0);
  const monthlyCustomers =
    selectedMonthlySummary?.customers ??
    monthEntries.reduce((sum, entry) => sum + entry.customers, 0);
  const monthlyAverageSpend = calculateAverageSpend(monthlySales, monthlyCustomers);
  const monthlyYoY =
    previousYearMonthSales > 0
      ? ((monthlySales - previousYearMonthSales) / previousYearMonthSales) * 100
      : undefined;

  const recentDailyLines = [...monthEntries]
    .reverse()
    .slice(0, 5)
    .map(
      (entry) =>
        `${entry.date}: 売上 ${formatYen(entry.sales)}, 客数 ${formatCount(entry.customers)}, 客単価 ${formatYen(entry.averageSpend || calculateAverageSpend(entry.sales, entry.customers))}, 昨対比 ${formatPercentDelta(resolveYoY(entry.sales, entry.previousSales, entry.salesYoY))}`,
    );

  const monthStart = `${selectedMonth}-01`;
  const nextMonthDate = new Date(`${monthStart}T00:00:00.000Z`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const monthEnd = new Date(nextMonthDate.getTime() - 86400000).toISOString().slice(0, 10);

  const weeklyRows = weeklySummaryEntries
    .filter((entry) => entry.weekEnd >= monthStart && entry.weekStart <= monthEnd)
    .map((entry) => {
      const compareStart = `${String(Number(entry.weekStart.slice(0, 4)) - 1)}${entry.weekStart.slice(4)}`;
      const compareEnd = `${String(Number(entry.weekEnd.slice(0, 4)) - 1)}${entry.weekEnd.slice(4)}`;
      const compareSales =
        weeklySummaryEntries.find((item) => item.weekStart === compareStart && item.weekEnd === compareEnd)
          ?.sales || 0;
      return `${entry.weekStart}〜${entry.weekEnd}: 売上 ${formatYen(entry.sales)}, 客数 ${formatCount(entry.customers)}, 客単価 ${formatYen(entry.averageSpend || calculateAverageSpend(entry.sales, entry.customers))}, 昨対比 ${formatPercentDelta(compareSales > 0 ? ((entry.sales - compareSales) / compareSales) * 100 : resolveYoY(entry.sales, entry.previousSales, entry.salesYoY))}`;
    });

  return [
    `【売上早見表（${selectedMonth}）】`,
    `当月累計売上: ${formatYen(monthlySales)}`,
    `当月累計客数: ${formatCount(monthlyCustomers)}`,
    `当月客単価: ${formatYen(monthlyAverageSpend)}`,
    `当月売上昨対比: ${formatPercentDelta(monthlyYoY)}`,
    "",
    "【売上早見表: 直近の日次売上（最大5件）】",
    ...(recentDailyLines.length ? recentDailyLines : ["- 日次データなし"]),
    "",
    "【売上早見表: 週次売上】",
    ...(weeklyRows.length ? weeklyRows : ["- 週次データなし"]),
  ].join("\n");
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

  const salesOverviewContext = buildSalesOverviewContext(entries);
  const context = [
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
    salesOverviewContext,
    "",
    "【運用指示書】",
    instructionsDoc.configured
      ? `${instructionsDoc.title}\n${instructionsDoc.body}`
      : instructionsDoc.body,
  ].join("\n");

  const evidenceCount =
    entries.length +
    memoEntries.length +
    reviewEntries.length +
    (weeklyActionPlan?.actions.length ?? 0) +
    (lineMessage.body.trim() ? 1 : 0);

  return { context, evidenceCount };
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

    // 過去の類似会話・記憶ダイジェストをベクトル検索で取得してコンテキストに注入
    let pastConversationContext = "";
    let digestContext = "";
    if (isTenantConfigStoreEnabled()) {
      try {
        const queryEmbedding = await generateEmbedding(message);
        if (queryEmbedding) {
          const [pastConvos, digests] = await Promise.all([
            searchSimilarConversations({
              tenantKey: access.tenant,
              queryEmbedding,
              excludeSessionId: sessionId,
              limit: 3,
            }),
            searchSimilarDigests({
              tenantKey: access.tenant,
              queryEmbedding,
              limit: 2,
            }),
          ]);

          if (pastConvos.length > 0) {
            pastConversationContext = [
              "【過去の関連会話（参考情報）】",
              "※ 以下は過去に同テナントで交わされた類似の会話です。回答の参考にしてください。",
              ...pastConvos.map((c) => {
                const date = c.createdAt.slice(0, 10);
                const agent = c.agentName ? ` [${c.agentName}]` : "";
                const answer = c.assistantContent ?? "（返答なし）";
                return `---\n[${date}${agent}]\nユーザー: ${c.userContent}\nAI: ${answer}`;
              }),
            ].join("\n");
          }

          if (digests.length > 0) {
            digestContext = [
              "【過去の経営サマリー（記憶ダイジェスト）】",
              "※ 以下は過去の会話を要約した経営記録です。長期的な文脈として参照してください。",
              ...digests.map((d) => `---\n[${d.periodStart} 〜 ${d.periodEnd}]\n${d.summary}`),
            ].join("\n");
          }
        }
      } catch (err) {
        console.error("[agent-chat] past conversation/digest search failed:", err);
      }
    }

    const { context: dashboardContext, evidenceCount } = await buildDashboardContext();
    const alwaysOnNotionContext = await getAlwaysOnNotionReferenceContext(access.tenant);
    if (!alwaysOnNotionContext && evidenceCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_unavailable",
          message:
            "Notion DB を参照できないため回答を生成できません。NOTION_* の設定と Notion インテグレーション接続を確認してください。",
        } satisfies AgentChatErrorResponse,
        { status: 503 },
      );
    }
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
      alwaysOnNotionContext,
      dashboardContext,
      agentHubKnowledgeContext,
      agentSpecificKnowledgeContext,
      restaurantKnowledgeContext,
      digestContext,
      pastConversationContext,
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

    // 会話ログ保存 → embedding生成 → embedding保存（すべて非同期・失敗してもレスポンスには影響させない）
    void (async () => {
      try {
        const [userId, assistantId] = await Promise.all([
          insertConversationLog({
            tenantKey: access.tenant,
            sessionId,
            principalId: access.principalId,
            agentName: agentName || "",
            role: "user",
            content: agentScopedMessage,
          }),
          insertConversationLog({
            tenantKey: access.tenant,
            sessionId,
            principalId: access.principalId,
            agentName: agentName || "",
            role: "assistant",
            content: reply,
          }),
        ]);
        const [userEmb, assistantEmb] = await Promise.all([
          generateEmbedding(agentScopedMessage),
          generateEmbedding(reply),
        ]);
        await Promise.all([
          userId && userEmb ? updateConversationEmbedding(userId, userEmb) : Promise.resolve(),
          assistantId && assistantEmb ? updateConversationEmbedding(assistantId, assistantEmb) : Promise.resolve(),
        ]);
      } catch (err) {
        console.error("[agent-chat] conversation log/embedding save failed:", err);
      }
    })();

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
