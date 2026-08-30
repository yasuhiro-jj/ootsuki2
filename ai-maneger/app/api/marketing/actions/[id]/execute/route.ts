import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import {
  completeMarketingActionExecution,
  startMarketingActionExecution,
} from "@/lib/marketing/repository";
import type { MarketingChannel } from "@/types/marketing";

function normalizeChannel(value: unknown): MarketingChannel {
  if (value === "gbp" || value === "canva" || value === "multi") return value;
  return "instagram";
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const mode = body.mode === "complete" ? "complete" : "start";
  const execution =
    mode === "complete"
      ? await completeMarketingActionExecution({
          tenantKey: access.tenant,
          actionId: context.params.id,
          externalPostId: typeof body.externalPostId === "string" ? body.externalPostId : "",
          externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : "",
          executedAt: typeof body.executedAt === "string" ? body.executedAt : "",
        })
      : await startMarketingActionExecution({
          tenantKey: access.tenant,
          actionId: context.params.id,
          channel: normalizeChannel(body.channel),
        });

  if (!execution) {
    return NextResponse.json({ ok: false, message: "実行履歴を作成できませんでした。" }, { status: 404 });
  }

  await logTenantAudit(request, access, {
    action: mode === "complete" ? "marketing_actions.execution_complete" : "marketing_actions.execution_start",
    resourceType: "marketing-action-executions",
    resourceId: execution.id,
    metadata: { actionId: context.params.id, channel: execution.channel },
  });

  return NextResponse.json({ ok: true, execution });
}
