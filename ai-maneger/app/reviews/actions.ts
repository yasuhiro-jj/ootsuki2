"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logCurrentTenantAudit } from "@/lib/api/audit";
import { requireCurrentTenantAccess } from "@/lib/api/tenant-access";
import { saveWeeklyReview } from "@/lib/notion/ootsuki";

interface WeeklyReviewState {
  error?: string;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveWeeklyReviewAction(
  _previousState: WeeklyReviewState,
  formData: FormData,
): Promise<WeeklyReviewState> {
  const weekStart = readString(formData, "weekStart");
  const weekEnd = readString(formData, "weekEnd");
  const status = readString(formData, "status");
  const summary = readString(formData, "summary");
  const relatedNumbers = readString(formData, "relatedNumbers");
  const nextActions = [1, 2, 3]
    .map((index) => readString(formData, `nextAction${index}`))
    .filter(Boolean);

  if (!weekStart || !weekEnd) {
    return { error: "対象週を特定できませんでした。" };
  }

  if (!summary) {
    return { error: "今週の振り返りを入力してください。" };
  }

  if (nextActions.length === 0) {
    return { error: "来週やることを少なくとも1つ入力してください。" };
  }

  try {
    const access = await requireCurrentTenantAccess("write");
    await saveWeeklyReview({
      weekStart,
      weekEnd,
      status,
      summary,
      relatedNumbers,
      nextActions,
    });
    await logCurrentTenantAudit(access, {
      action: "weekly_review.save",
      resourceType: "weekly-review",
      resourceId: weekStart,
      metadata: { weekEnd, status, nextActionsCount: nextActions.length },
      path: "/dashboard",
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `週次レビューの保存に失敗しました: ${error.message}`
          : "週次レビューの保存に失敗しました。",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/reviews");
  redirect("/dashboard");
}
