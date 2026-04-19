export type TenantKey = "ootsuki" | "demo";
export type TenantRole = "viewer" | "editor" | "admin" | "owner";

export type TenantNotionConfig = {
  tenant: TenantKey;
  notionToken: string;
  projectDbId: string;
  ootsukiProjectPageId: string;
  dailySalesDbId: string;
  kpiDbId: string;
  memoDbId: string;
  lineReportPageId: string;
  productCostDbId: string;
  weeklyActionsDbId: string;
};

export type TenantConfigRecord = {
  tenantKey: TenantKey;
  notionTokenEnc: string;
  projectDbId: string;
  ootsukiProjectPageId: string;
  dailySalesDbId: string;
  kpiDbId: string;
  memoDbId: string;
  lineReportPageId: string;
  productCostDbId: string;
  weeklyActionsDbId: string;
  isActive: boolean;
  updatedAt: string;
};

export type TenantMembershipRecord = {
  tenantKey: TenantKey;
  principalId: string;
  role: TenantRole;
  isActive: boolean;
  updatedAt: string;
};

export type TenantAuditLogRecord = {
  id: string;
  tenantKey: TenantKey;
  principalId: string;
  role: string;
  action: string;
  resourceType: string;
  resourceId: string;
  path: string;
  method: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
