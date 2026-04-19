import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { saveWeeklyReview } from "@/lib/notion/ootsuki";

interface WeeklyReviewRequestBody {
  weekStart?: string;
  weekEnd?: string;
  status?: string;
  summary?: string;
  relatedNumbers?: string;
  nextActions?: string[];
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: WeeklyReviewRequestBody;
  try {
    body = (await request.json()) as WeeklyReviewRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません。" }, { status: 400 });
  }

  const weekStart = typeof body.weekStart === "string" ? body.weekStart.trim() : "";
  const weekEnd = typeof body.weekEnd === "string" ? body.weekEnd.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "進行中";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const relatedNumbers = typeof body.relatedNumbers === "string" ? body.relatedNumbers.trim() : "";
  const nextActions = Array.isArray(body.nextActions)
    ? body.nextActions.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];

  if (!weekStart || !weekEnd) {
    return NextResponse.json({ ok: false, message: "対象週を特定できませんでした。" }, { status: 400 });
  }

  if (!summary) {
    return NextResponse.json({ ok: false, message: "今週の振り返りを入力してください。" }, { status: 400 });
  }

  if (nextActions.length === 0) {
    return NextResponse.json({ ok: false, message: "来週やることを少なくとも1つ入力してください。" }, { status: 400 });
  }

  try {
    console.log("[weekly-review] saving…", { tenant: access.tenant, weekStart, weekEnd });
    await saveWeeklyReview({
      weekStart,
      weekEnd,
      status,
      summary,
      relatedNumbers,
      nextActions,
    });
    await logTenantAudit(request, access, {
      action: "weekly_review.save",
      resourceType: "weekly-review",
      resourceId: weekStart,
      metadata: { weekEnd, status, nextActionsCount: nextActions.length },
    });
    console.log("[weekly-review] saved OK");

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[weekly-review] error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `週次レビューの保存に失敗しました: ${error.message}`
            : "週次レビューの保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
