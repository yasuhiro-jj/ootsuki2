import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { generateMarketingActions } from "@/lib/marketing/engine";
import { getChatbotNodesSummaryForPrompt } from "@/lib/marketing/chatbot-integration";
import { getProductRecommendationSummaryForPrompt } from "@/lib/marketing/product-insights";
import { getTimeZoneSalesSummaryForPrompt } from "@/lib/marketing/time-zone-sales-insights";
import { getMarketingMetricsSnapshot } from "@/lib/marketing/metrics";
import {
  getOrCreateDefaultMarketingStore,
  listMarketingActions,
  listMarketingExecutions,
  listMarketingGoals,
  saveMarketingActions,
  upsertIntegrationStatuses,
} from "@/lib/marketing/repository";
import { getIntegrationStatuses } from "@/lib/marketing/integration-status";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  const store = await getOrCreateDefaultMarketingStore(access.tenant);
  const [metrics, goals, actions, executions] = await Promise.all([
    getMarketingMetricsSnapshot(store),
    listMarketingGoals(access.tenant, store.id),
    listMarketingActions(access.tenant, 20, store.id),
    listMarketingExecutions(access.tenant, store.id),
  ]);
  const integrationStatuses = await getIntegrationStatuses(store);

  return NextResponse.json({ ok: true, store, goals, metrics, actions, executions, integrationStatuses });
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    return NextResponse.json(
      { ok: false, message: "OPENAI_API_KEY が未設定のため、AI施策生成は実行できません。" },
      { status: 503 },
    );
  }

  try {
    const store = await getOrCreateDefaultMarketingStore(access.tenant);
    const [
      metricsSnapshot,
      goals,
      pastActions,
      executions,
      chatbotNodesSummary,
      productRecommendationSummary,
      timeZoneSalesSummary,
    ] = await Promise.all([
      getMarketingMetricsSnapshot(store),
      listMarketingGoals(access.tenant, store.id),
      listMarketingActions(access.tenant, 20, store.id),
      listMarketingExecutions(access.tenant, store.id),
      getChatbotNodesSummaryForPrompt(access.tenant).catch(() => "（会話ノードDBの取得に失敗しました）"),
      getProductRecommendationSummaryForPrompt(access.tenant).catch(
        () => "（商品別粗利率データの取得に失敗しました）",
      ),
      getTimeZoneSalesSummaryForPrompt(access.tenant).catch(
        () => "（時間帯別売上データの取得に失敗しました）",
      ),
    ]);
    const integrationStatuses = await getIntegrationStatuses(store);
    await upsertIntegrationStatuses(access.tenant, store.id, integrationStatuses);

    const generated = await generateMarketingActions({
      store,
      goals,
      metricsSnapshot,
      pastActions,
      executions,
      chatbotNodesSummary,
      productRecommendationSummary,
      timeZoneSalesSummary,
    });
    const actions = await saveMarketingActions({
      tenantKey: access.tenant,
      storeId: store.id,
      actions: generated.actions,
      metricsSnapshot,
    });
    await logTenantAudit(request, access, {
      action: "marketing_actions.generate",
      resourceType: "marketing-actions",
      metadata: { storeId: store.id, actionsCount: actions.length, diagnosis: generated.diagnosis },
    });

    return NextResponse.json({
      ok: true,
      store,
      goals,
      diagnosis: generated.diagnosis,
      actions,
      metrics: metricsSnapshot,
      integrationStatuses,
    });
  } catch (error) {
    console.error("[marketing-actions]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "マーケティング施策の生成に失敗しました。",
      },
      { status: 500 },
    );
  }
}
