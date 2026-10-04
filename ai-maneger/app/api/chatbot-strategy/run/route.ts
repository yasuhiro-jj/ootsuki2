import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { listRecentStrategies } from "@/lib/chatbot-strategy/publisher";
import { getStrategyMode, runChatbotStrategyGeneration } from "@/lib/chatbot-strategy/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  try {
    const strategies = await listRecentStrategies(access.tenant);
    return NextResponse.json({ ok: true, mode: getStrategyMode(), strategies });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "戦略の取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  try {
    const result = await runChatbotStrategyGeneration({ tenant: access.tenant });
    await logTenantAudit(request, access, {
      action: "chatbot_strategy.run",
      resourceType: "chatbot-sales-strategy",
      resourceId: result.strategyId,
      metadata: {
        mode: result.mode,
        ok: result.ok,
        reason: result.reason,
        productCount: result.productCount,
      },
    });
    return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "戦略の生成に失敗しました。",
      },
      { status: 500 },
    );
  }
}
