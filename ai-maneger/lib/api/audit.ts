import { headers } from "next/headers";
import { insertTenantAuditLog } from "@/lib/tenant-config/repository";
import type { TenantAccessGrant } from "@/lib/api/tenant-access";

export async function logTenantAudit(
  request: Request,
  access: TenantAccessGrant,
  params: {
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const url = new URL(request.url);
  await insertTenantAuditLog({
    tenantKey: access.tenant,
    principalId: access.principalId,
    role: access.role,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    path: url.pathname,
    method: request.method,
    metadata: params.metadata,
  });
}

export async function logCurrentTenantAudit(
  access: TenantAccessGrant,
  params: {
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    path?: string;
    method?: string;
  },
) {
  const headerStore = await headers();
  const referer = headerStore.get("referer");
  const path = params.path || (referer ? new URL(referer).pathname : "/__server_action");

  await insertTenantAuditLog({
    tenantKey: access.tenant,
    principalId: access.principalId,
    role: access.role,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    path,
    method: params.method || "SERVER_ACTION",
    metadata: params.metadata,
  });
}
