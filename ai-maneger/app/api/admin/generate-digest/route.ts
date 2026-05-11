import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { runMemoryDigestGeneration } from "@/lib/db/memory-digest-runner";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "admin");
  if (!access.ok) return access.response;

  let body: { periodStart?: string; periodEnd?: string; digestType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません" }, { status: 400 });
  }

  const periodStart = typeof body.periodStart === "string" ? body.periodStart.trim() : "";
  const periodEnd = typeof body.periodEnd === "string" ? body.periodEnd.trim() : "";
  const digestType = typeof body.digestType === "string" ? body.digestType.trim() : "weekly";

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ ok: false, message: "periodStart と periodEnd は必須です（例: 2026-05-01）" }, { status: 400 });
  }

  const result = await runMemoryDigestGeneration({
    tenantKey: access.tenant,
    periodStart,
    periodEnd,
    digestType,
  });

  if (!result.ok) {
    if (result.reason === "invalid_period") {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: result.message }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    digestId: result.digestId,
    tenant: access.tenant,
    periodStart,
    periodEnd,
    digestType,
    sourceCount: result.sourceCount,
    summary: result.summary,
  });
}
