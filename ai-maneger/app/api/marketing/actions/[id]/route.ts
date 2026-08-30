import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { updateMarketingActionApproval } from "@/lib/marketing/repository";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "JSONの形式が正しくありません。" }, { status: 400 });
  }

  const approval = body.approval;
  if (approval !== "approved" && approval !== "changes_requested" && approval !== "rejected") {
    return NextResponse.json({ ok: false, message: "approval が不正です。" }, { status: 400 });
  }

  const action = await updateMarketingActionApproval({
    tenantKey: access.tenant,
    actionId: context.params.id,
    approval,
    principalId: access.principalId,
    revisionNote: typeof body.revisionNote === "string" ? body.revisionNote : "",
  });
  if (!action) {
    return NextResponse.json({ ok: false, message: "施策が見つかりません。" }, { status: 404 });
  }

  await logTenantAudit(request, access, {
    action: `marketing_actions.${approval}`,
    resourceType: "marketing-actions",
    resourceId: action.id,
    metadata: { storeId: action.storeId, approval },
  });

  return NextResponse.json({ ok: true, action });
}
