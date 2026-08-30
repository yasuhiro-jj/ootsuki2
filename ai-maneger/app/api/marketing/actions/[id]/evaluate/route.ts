import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { generateReply } from "@/lib/agent-chat";
import { formatMetricsForPrompt, getMarketingMetricsSnapshot } from "@/lib/marketing/metrics";
import {
  getOrCreateDefaultMarketingStore,
  listMarketingActions,
  saveMarketingActionEvaluation,
} from "@/lib/marketing/repository";

export const runtime = "nodejs";

const JSON_INSTRUCTION = `次のJSONだけを返してください。Markdownや説明文は禁止です。
{
  "summary": "施策結果の短い評価",
  "kpi_result": "対象KPIがどう変化したか",
  "learning": "次に活かす学び",
  "next_step": "次の改善アクション",
  "score": 0
}`;

export async function POST(request: Request, context: { params: { id: string } }) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  const store = await getOrCreateDefaultMarketingStore(access.tenant);
  const actionId = context.params.id;
  const actions = await listMarketingActions(access.tenant, 50, store.id);
  const action = actions.find((item) => item.id === actionId);
  if (!action) {
    return NextResponse.json({ ok: false, message: "施策が見つかりません。" }, { status: 404 });
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    return NextResponse.json(
      { ok: false, message: "OPENAI_API_KEY が未設定のため、施策評価は実行できません。" },
      { status: 503 },
    );
  }

  const latestMetrics = await getMarketingMetricsSnapshot(store);
  const prompt = [
    "保存済みのマーケティング施策について、投稿後に再取得した指標から結果評価を作成してください。",
    "",
    `[店舗]\nid=${store.id}\nname=${store.name}`,
    "",
    `[施策]\nタイトル: ${action.title}\n対象: ${action.targetChannel}\nテーマ: ${action.contentTheme}\n対象KPI: ${action.targetKpi}\n推奨アクション: ${action.recommendedAction}`,
    "",
    "[実行前/保存時の指標]",
    formatMetricsForPrompt(action.metricsSnapshot),
    "",
    "[投稿後/最新指標]",
    formatMetricsForPrompt(latestMetrics),
  ].join("\n");

  try {
    const reply = await generateReply({
      userMessage: prompt,
      dashboardContext: "",
      agentInstruction:
        "あなたはマーケティング施策の効果検証担当です。保存時の指標と最新指標を比べ、断定しすぎず、次の改善に使える評価をJSONで返してください。",
      jsonInstruction: JSON_INSTRUCTION,
    });
    const match = reply.match(/\{[\s\S]*\}/);
    const evaluation = match ? (JSON.parse(match[0]) as Record<string, unknown>) : { summary: reply };
    const updated = await saveMarketingActionEvaluation({
      tenantKey: access.tenant,
      actionId,
      evaluation,
      metricsSnapshot: latestMetrics,
    });

    await logTenantAudit(request, access, {
      action: "marketing_actions.evaluate",
      resourceType: "marketing-actions",
      resourceId: actionId,
      metadata: { storeId: store.id, ...evaluation },
    });

    return NextResponse.json({ ok: true, action: updated, evaluation, metrics: latestMetrics });
  } catch (error) {
    console.error("[marketing-actions:evaluate]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "施策評価に失敗しました。",
      },
      { status: 500 },
    );
  }
}
