import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { upsertWeeklySummary } from "@/lib/notion/ootsuki";

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: { referenceDate?: string };
  try {
    body = (await request.json()) as { referenceDate?: string };
  } catch {
    body = {};
  }

  const referenceDate =
    typeof body.referenceDate === "string" && body.referenceDate.trim()
      ? body.referenceDate.trim()
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

  try {
    console.log("[weekly-summary] updating…", { tenant: access.tenant, referenceDate });
    await upsertWeeklySummary(referenceDate);
    await logTenantAudit(request, access, {
      action: "weekly_summary.upsert",
      resourceType: "weekly-summary",
      resourceId: referenceDate,
    });
    console.log("[weekly-summary] updated OK");

    return NextResponse.json({ ok: true, referenceDate });
  } catch (error) {
    console.error("[weekly-summary] error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `週次集計の更新に失敗しました: ${error.message}`
            : "週次集計の更新に失敗しました。",
      },
      { status: 500 },
    );
  }
}
