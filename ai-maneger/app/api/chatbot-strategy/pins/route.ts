import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { addPin, listPins, removePin } from "@/lib/chatbot-strategy/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "read");
  if (!access.ok) return access.response;

  try {
    const pins = await listPins(access.tenant);
    return NextResponse.json({ ok: true, pins });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "指定リストの取得に失敗しました。",
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

  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  if (!productName) {
    return NextResponse.json(
      { ok: false, message: "商品名を入力してください。" },
      { status: 400 },
    );
  }

  try {
    await addPin({
      tenant: access.tenant,
      productName,
      menuPageId: typeof body.menuPageId === "string" ? body.menuPageId.trim() || null : null,
      note: typeof body.note === "string" ? body.note : "",
      createdBy: access.principalId,
    });
    await logTenantAudit(request, access, {
      action: "chatbot_strategy.pin_add",
      resourceType: "chatbot-recommendation-pin",
      metadata: { productName },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "指定の追加に失敗しました。",
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
    await removePin(access.tenant, id);
    await logTenantAudit(request, access, {
      action: "chatbot_strategy.pin_remove",
      resourceType: "chatbot-recommendation-pin",
      resourceId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "指定の削除に失敗しました。",
      },
      { status: 500 },
    );
  }
}
