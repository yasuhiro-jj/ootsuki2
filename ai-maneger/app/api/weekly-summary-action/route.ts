import { NextRequest, NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { upsertWeeklySummary } from "@/lib/notion/ootsuki";

export async function GET(request: NextRequest) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  const weekStart = request.nextUrl.searchParams.get("weekStart") ?? "";

  const referenceDate = weekStart.trim()
    ? weekStart.trim()
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

  try {
    console.log("[weekly-summary-action] updating…", { tenant: access.tenant, referenceDate });
    await upsertWeeklySummary(referenceDate);
    await logTenantAudit(request, access, {
      action: "weekly_summary.upsert_from_ui",
      resourceType: "weekly-summary",
      resourceId: referenceDate,
    });
    console.log("[weekly-summary-action] updated OK");

    const destination = new URL("/dashboard", request.url);
    destination.searchParams.set("updated", "1");
    destination.searchParams.set("t", String(Date.now()));
    return NextResponse.redirect(destination, 303);
  } catch (error) {
    console.error("[weekly-summary-action] error:", error);

    const destination = new URL("/dashboard", request.url);
    destination.searchParams.set("error", "weekly-summary-failed");
    return NextResponse.redirect(destination, 303);
  }
}
