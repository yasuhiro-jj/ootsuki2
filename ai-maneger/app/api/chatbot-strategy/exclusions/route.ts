import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { addExclusion, listExclusions, removeExclusion } from "@/lib/chatbot-strategy/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  try {
    const exclusions = await listExclusions(access.tenant);
    return NextResponse.json({ ok: true, exclusions });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "除外リストの取得に失敗しました。",
      },
      { status: 500 },
    );
  }
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

  const menuPageId = typeof body.menuPageId === "string" ? body.menuPageId.trim() : "";
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  if (!menuPageId && !productName) {
    return NextResponse.json(
      { ok: false, message: "メニューのページIDか商品名のどちらかを指定してください。" },
      { status: 400 },
    );
  }

  try {
    await addExclusion({
      tenant: access.tenant,
      menuPageId: menuPageId || null,
      productName: productName || null,
      reason: typeof body.reason === "string" ? body.reason : "",
      createdBy: access.principalId,
    });
    await logTenantAudit(request, access, {
      action: "chatbot_strategy.exclusion_add",
      resourceType: "chatbot-recommendation-exclusion",
      metadata: { menuPageId, productName },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "除外の追加に失敗しました。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, message: "id を指定してください。" }, { status: 400 });
  }

  try {
    await removeExclusion(access.tenant, id);
    await logTenantAudit(request, access, {
      action: "chatbot_strategy.exclusion_remove",
      resourceType: "chatbot-recommendation-exclusion",
      resourceId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "除外の削除に失敗しました。",
      },
      { status: 500 },
    );
  }
}
