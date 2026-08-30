import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { getOrCreateDefaultMarketingStore, listMarketingGoals, saveMarketingGoal } from "@/lib/marketing/repository";
import type { MarketingGoalInput, MarketingGoalType } from "@/types/marketing";

const goalTypes: MarketingGoalType[] = [
  "instagram_reach",
  "instagram_non_follower_reach",
  "gbp_views",
  "gbp_actions",
  "reviews",
  "reservations",
  "line_registrations",
  "sales",
  "custom",
];

function parseNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;
  const store = await getOrCreateDefaultMarketingStore(access.tenant);
  const goals = await listMarketingGoals(access.tenant, store.id);
  return NextResponse.json({ ok: true, store, goals });
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "JSONの形式が正しくありません。" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  const goalType = goalTypes.includes(body.goalType as MarketingGoalType)
    ? (body.goalType as MarketingGoalType)
    : "custom";
  if (!title) {
    return NextResponse.json({ ok: false, message: "目標名を入力してください。" }, { status: 400 });
  }

  const store = await getOrCreateDefaultMarketingStore(access.tenant);
  const input: MarketingGoalInput = {
    storeId: typeof body.storeId === "string" && body.storeId ? body.storeId : store.id,
    title,
    description: typeof body.description === "string" ? body.description : "",
    goalType,
    targetValue: parseNumber(body.targetValue),
    currentValue: parseNumber(body.currentValue),
    unit: typeof body.unit === "string" ? body.unit : "",
    startDate: typeof body.startDate === "string" ? body.startDate : "",
    endDate: typeof body.endDate === "string" ? body.endDate : "",
    status: body.status === "completed" || body.status === "paused" ? body.status : "active",
  };

  try {
    const goal = await saveMarketingGoal(access.tenant, input);
    await logTenantAudit(request, access, {
      action: "marketing_goals.create",
      resourceType: "marketing-goals",
      resourceId: goal.id,
      metadata: { storeId: goal.storeId, goalType: goal.goalType },
    });
    return NextResponse.json({ ok: true, goal });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "マーケティング目標の保存に失敗しました。" },
      { status: 500 },
    );
  }
}
