import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { getOsDashboardData } from "@/lib/os/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/os/dashboard … ダッシュボード1枚分のデータ（スマホアプリ・他画面から再利用する用） */
export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;
  const data = await getOsDashboardData(access.tenant);
  return NextResponse.json({ ok: true, data });
}
