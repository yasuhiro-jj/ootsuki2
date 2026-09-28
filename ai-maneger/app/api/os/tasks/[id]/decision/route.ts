import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { OsDecisionStoreError, insertOsDecision } from "@/lib/os/decision-store";
import { nextStateForDecision } from "@/lib/os/decisions";
import { getOsDashboardData } from "@/lib/os/data";
import { DECISION_TYPES, type DecisionType } from "@/types/os";

interface DecisionBody {
  decision?: string;
  reasonText?: string;
  holdUntil?: string;
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: DecisionBody;
  try {
    body = (await request.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません。" }, { status: 400 });
  }

  const decision = readText(body.decision);
  if (!DECISION_TYPES.includes(decision as DecisionType)) {
    return NextResponse.json({ ok: false, message: "判断の種類が正しくありません。" }, { status: 400 });
  }
  const decisionType = decision as DecisionType;
  const reasonText = readText(body.reasonText);
  const holdUntil = readText(body.holdUntil);
  if ((decisionType === "reject" || decisionType === "hold") && !reasonText) {
    return NextResponse.json({ ok: false, message: "却下と保留には理由が必要です。" }, { status: 400 });
  }
  if (holdUntil && !/^\d{4}-\d{2}-\d{2}$/.test(holdUntil)) {
    return NextResponse.json({ ok: false, message: "再提案日は YYYY-MM-DD で指定してください。" }, { status: 400 });
  }

  const taskId = context.params.id;
  const data = await getOsDashboardData(access.tenant);
  const task = data.tasks.find((item) => item.id === taskId);
  if (!task) {
    return NextResponse.json({ ok: false, message: "対象の仕事が見つかりません。" }, { status: 404 });
  }
  if (task.state !== "PROPOSED" && task.state !== "DETECTED") {
    return NextResponse.json({ ok: false, message: "この仕事はすでに判断済みです。" }, { status: 409 });
  }

  try {
    const stored = await insertOsDecision(access.tenant, {
      taskId: task.id,
      taskTitle: task.title,
      agentKey: task.agentKey,
      decision: decisionType,
      reasonText: reasonText || undefined,
      holdUntil: decisionType === "hold" ? holdUntil || undefined : undefined,
      fromState: task.state,
      toState: nextStateForDecision(decisionType),
      decidedBy: access.principalId,
    });
    await logTenantAudit(request, access, {
      action: "os.task.decision",
      resourceType: "os-task",
      resourceId: task.id,
      metadata: { decision: decisionType, toState: stored.toState },
    });
    return NextResponse.json({ ok: true, decision: stored });
  } catch (error) {
    if (error instanceof OsDecisionStoreError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? `判断の保存に失敗しました: ${error.message}` : "判断の保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
