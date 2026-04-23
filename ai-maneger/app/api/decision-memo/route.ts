import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { saveDecisionMemo } from "@/lib/notion/decision-memo";
import { requireTenantAccess } from "@/lib/api/tenant-access";

interface DecisionMemoRequestBody {
  title?: string;
  status?: string;
  summary?: string;
  relatedNumbers?: string;
  nextAction?: string;
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: DecisionMemoRequestBody;
  try {
    body = (await request.json()) as DecisionMemoRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません。" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const relatedNumbers = typeof body.relatedNumbers === "string" ? body.relatedNumbers.trim() : "";
  const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim() : "";

  if (!summary) {
    return NextResponse.json({ ok: false, message: "要点を入力してください。" }, { status: 400 });
  }

  try {
    const memoId = await saveDecisionMemo({
      title,
      status,
      summary,
      relatedNumbers,
      nextAction,
    });
    await logTenantAudit(request, access, {
      action: "decision_memo.save",
      resourceType: "decision-memo",
      resourceId: memoId,
      metadata: { status, hasRelatedNumbers: Boolean(relatedNumbers), hasNextAction: Boolean(nextAction) },
    });
    return NextResponse.json({ ok: true, id: memoId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `判断メモの保存に失敗しました: ${error.message}`
            : "判断メモの保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
