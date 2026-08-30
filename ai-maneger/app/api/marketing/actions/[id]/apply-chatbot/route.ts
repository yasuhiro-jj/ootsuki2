import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { applyChatbotNodeBoost, isChatbotIntegrationConfigured } from "@/lib/marketing/chatbot-integration";
import { completeChatbotMarketingActionExecution, getMarketingActionById } from "@/lib/marketing/repository";

export async function POST(request: Request, context: { params: { id: string } }) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  if (!isChatbotIntegrationConfigured()) {
    return NextResponse.json({ ok: false, message: "チャットボット連携が未設定です。" }, { status: 503 });
  }

  const action = await getMarketingActionById(access.tenant, context.params.id);
  if (!action) {
    return NextResponse.json({ ok: false, message: "施策が見つかりません。" }, { status: 404 });
  }
  if (action.approvalStatus !== "approved") {
    return NextResponse.json(
      { ok: false, message: "承認済みの施策のみチャットボットへ反映できます。" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "JSONの形式が正しくありません。" }, { status: 400 });
  }

  const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
  const newPriority = Number(body.newPriority);
  const addKeywords = Array.isArray(body.addKeywords)
    ? body.addKeywords.filter((k): k is string => typeof k === "string")
    : [];

  if (!pageId) {
    return NextResponse.json({ ok: false, message: "対象の会話ノード（pageId）を指定してください。" }, { status: 400 });
  }
  if (!Number.isFinite(newPriority)) {
    return NextResponse.json({ ok: false, message: "優先度の数値が不正です。" }, { status: 400 });
  }

  const result = await applyChatbotNodeBoost({ pageId, addKeywords, newPriority });
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 502 });
  }

  const execution = await completeChatbotMarketingActionExecution({
    tenantKey: access.tenant,
    actionId: context.params.id,
    externalUrl: result.pageUrl,
    resultSummary: `会話ノード「${result.nodeName}」の優先度を ${result.before.priority ?? "未設定"} → ${result.after.priority} に更新、キーワードを追加しました。`,
    metricsBefore: result.before,
    metricsAfter: result.after,
  });

  if (!execution) {
    return NextResponse.json({ ok: false, message: "実行履歴を作成できませんでした。" }, { status: 404 });
  }

  await logTenantAudit(request, access, {
    action: "marketing_actions.apply_chatbot",
    resourceType: "marketing-action-executions",
    resourceId: execution.id,
    metadata: { actionId: context.params.id, pageId, nodeName: result.nodeName },
  });

  return NextResponse.json({ ok: true, execution, node: result });
}
