import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { encryptSecret } from "@/lib/tenant-config/crypto";
import {
  isTenantConfigStoreEnabled,
  listTenantConfigRecords,
  upsertTenantConfigRecord,
} from "@/lib/tenant-config/repository";
import type { TenantKey } from "@/lib/tenant-config/types";

type UpsertRequestBody = {
  tenantKey?: TenantKey;
  notionToken?: string;
  projectDbId?: string;
  ootsukiProjectPageId?: string;
  dailySalesDbId?: string;
  kpiDbId?: string;
  memoDbId?: string;
  lineReportPageId?: string;
  productCostDbId?: string;
  weeklyActionsDbId?: string;
  isActive?: boolean;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

function validateTenantKey(value: unknown): TenantKey | null {
  return value === "ootsuki" || value === "demo" ? value : null;
}

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "admin");
  if (!access.ok) return access.response;

  if (!isTenantConfigStoreEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      tenants: [],
      message: "TENANT_CONFIG_STORE_ENABLED=false のためDB設定ストアは無効です。",
    });
  }

  const records = await listTenantConfigRecords();
  return NextResponse.json({
    ok: true,
    enabled: true,
    tenant: access.tenant,
    tenants: records.map((record) => ({
      tenantKey: record.tenantKey,
      isActive: record.isActive,
      updatedAt: record.updatedAt,
      projectDbId: record.projectDbId,
      ootsukiProjectPageId: record.ootsukiProjectPageId,
      dailySalesDbId: record.dailySalesDbId,
      kpiDbId: record.kpiDbId,
      memoDbId: record.memoDbId,
      lineReportPageId: record.lineReportPageId,
      productCostDbId: record.productCostDbId,
      weeklyActionsDbId: record.weeklyActionsDbId,
      notionToken: record.notionTokenEnc ? "***masked***" : "",
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireTenantAccess(request, "admin");
  if (!access.ok) return access.response;

  if (!isTenantConfigStoreEnabled()) {
    return NextResponse.json(
      { ok: false, message: "TENANT_CONFIG_STORE_ENABLED=true で有効化してください。" },
      { status: 400 },
    );
  }

  let body: UpsertRequestBody;
  try {
    body = (await request.json()) as UpsertRequestBody;
  } catch {
    return badRequest("JSON の形式が正しくありません。");
  }

  const tenantKey = validateTenantKey(body.tenantKey);
  if (!tenantKey) return badRequest("tenantKey は ootsuki または demo を指定してください。");

  const notionToken = (body.notionToken || "").trim();
  if (!notionToken) return badRequest("notionToken は必須です。");

  const requiredKeys = [
    "projectDbId",
    "ootsukiProjectPageId",
    "dailySalesDbId",
    "kpiDbId",
    "memoDbId",
    "lineReportPageId",
    "productCostDbId",
    "weeklyActionsDbId",
  ] as const;

  for (const key of requiredKeys) {
    if (!(body[key] || "").trim()) {
      return badRequest(`${key} は必須です。`);
    }
  }

  await upsertTenantConfigRecord({
    tenantKey,
    notionTokenEnc: encryptSecret(notionToken),
    projectDbId: body.projectDbId!.trim(),
    ootsukiProjectPageId: body.ootsukiProjectPageId!.trim(),
    dailySalesDbId: body.dailySalesDbId!.trim(),
    kpiDbId: body.kpiDbId!.trim(),
    memoDbId: body.memoDbId!.trim(),
    lineReportPageId: body.lineReportPageId!.trim(),
    productCostDbId: body.productCostDbId!.trim(),
    weeklyActionsDbId: body.weeklyActionsDbId!.trim(),
    isActive: body.isActive ?? true,
  });
  await logTenantAudit(request, access, {
    action: "tenant_config.upsert",
    resourceType: "tenant-config",
    resourceId: tenantKey,
    metadata: { isActive: body.isActive ?? true },
  });

  return NextResponse.json({ ok: true, tenant: access.tenant });
}
