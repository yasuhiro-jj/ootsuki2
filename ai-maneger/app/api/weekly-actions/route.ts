import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { getWeeklyActionPlan, saveWeeklyActionPlan } from "@/lib/notion/ootsuki";

interface WeeklyActionsRequestBody {
  weekStart?: string;
  weekEnd?: string;
  actions?: string[];
  source?: string;
  status?: string;
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: WeeklyActionsRequestBody;
  try {
    body = (await request.json()) as WeeklyActionsRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません。" }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === "string" ? body.weekStart.trim() : "";
  const weekEnd = typeof body.weekEnd === "string" ? body.weekEnd.trim() : "";
  const actions = Array.isArray(body.actions)
    ? body.actions.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ ok: false, message: "週開始・週終了が不足しています。" }, { status: 400 });
  }
  if (actions.length === 0) {
    return NextResponse.json({ ok: false, message: "保存する実行項目がありません。" }, { status: 400 });
  }

  try {
    await saveWeeklyActionPlan({
      weekStart,
      weekEnd,
      actions,
      source: typeof body.source === "string" ? body.source.trim() : "",
      status: typeof body.status === "string" ? body.status.trim() : "",
    });
    await logTenantAudit(request, access, {
      action: "weekly_actions.save",
      resourceType: "weekly-actions",
      resourceId: weekStart,
      metadata: { weekEnd, actionsCount: actions.length },
    });
    const plan = await getWeeklyActionPlan(weekStart, weekEnd);

    return NextResponse.json({
      ok: true,
      plan,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "今週の実行項目の保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
