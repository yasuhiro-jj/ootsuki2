import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import {
  isTenantConfigStoreEnabled,
  listTenantMembershipRecords,
  upsertTenantMembershipRecord,
} from "@/lib/tenant-config/repository";
import type { TenantKey, TenantRole } from "@/lib/tenant-config/types";

type UpsertMembershipRequestBody = {
  tenantKey?: TenantKey;
  principalId?: string;
  role?: TenantRole;
  isActive?: boolean;
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

function validateTenantKey(value: unknown): TenantKey | null {
  return value === "ootsuki" || value === "demo" ? value : null;
}

function validateRole(value: unknown): TenantRole | null {
  return value === "viewer" || value === "editor" || value === "admin" || value === "owner" ? value : null;
}

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "admin");
  if (!access.ok) return access.response;

  if (!isTenantConfigStoreEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      memberships: [],
      message: "TENANT_CONFIG_STORE_ENABLED=false のためDB設定ストアは無効です。",
    });
  }

  const url = new URL(request.url);
  const tenantFilter = validateTenantKey(url.searchParams.get("tenantKey"));
  const records = await listTenantMembershipRecords(tenantFilter ?? undefined);
  return NextResponse.json({
    ok: true,
    enabled: true,
    tenant: access.tenant,
    memberships: records,
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

  let body: UpsertMembershipRequestBody;
  try {
    body = (await request.json()) as UpsertMembershipRequestBody;
  } catch {
    return badRequest("JSON の形式が正しくありません。");
  }

  const tenantKey = validateTenantKey(body.tenantKey);
  const role = validateRole(body.role);
  const principalId = (body.principalId || "").trim();

  if (!tenantKey) return badRequest("tenantKey は ootsuki または demo を指定してください。");
  if (!principalId) return badRequest("principalId は必須です。");
  if (!role) return badRequest("role は viewer/editor/admin/owner を指定してください。");

  await upsertTenantMembershipRecord({
    tenantKey,
    principalId,
    role,
    isActive: body.isActive ?? true,
  });
  await logTenantAudit(request, access, {
    action: "tenant_membership.upsert",
    resourceType: "tenant-membership",
    resourceId: `${tenantKey}:${principalId}`,
    metadata: { targetTenant: tenantKey, targetRole: role, isActive: body.isActive ?? true },
  });

  return NextResponse.json({ ok: true, tenant: access.tenant });
}
