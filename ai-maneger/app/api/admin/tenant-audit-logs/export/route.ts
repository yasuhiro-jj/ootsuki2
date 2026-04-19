import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { isTenantConfigStoreEnabled, listTenantAuditLogs } from "@/lib/tenant-config/repository";
import type { TenantAuditLogRecord, TenantKey } from "@/lib/tenant-config/types";

const AUDIT_ACTION_OPTIONS = new Set([
  "daily_input.save",
  "daily_input.batch_save",
  "weekly_review.save",
  "weekly_actions.save",
  "weekly_summary.upsert",
  "weekly_summary.upsert_from_ui",
  "tenant_config.upsert",
  "tenant_membership.upsert",
]);

function validateTenantKey(value: string | null): TenantKey | undefined {
  return value === "ootsuki" || value === "demo" ? value : undefined;
}

function validateDate(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function validateActions(values: string[]) {
  return values.map((value) => value.trim()).filter((value) => AUDIT_ACTION_OPTIONS.has(value));
}

function validateSortOrder(value: string | null): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function escapeCsv(value: unknown) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function summarizeMetadata(metadata: TenantAuditLogRecord["metadata"]) {
  return JSON.stringify(metadata || {});
}

export async function GET(request: Request) {
  const access = await requireTenantAccess(request, "admin");
  if (!access.ok) return access.response;

  if (!isTenantConfigStoreEnabled()) {
    return NextResponse.json(
      { ok: false, message: "TENANT_CONFIG_STORE_ENABLED=true で有効化してください。" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const tenantKey =
    validateTenantKey(url.searchParams.get("auditTenant")) ||
    validateTenantKey(url.searchParams.get("tenant")) ||
    access.tenant;
  const actions = validateActions(url.searchParams.getAll("action"));
  const fromDate = validateDate(url.searchParams.get("from"));
  const toDate = validateDate(url.searchParams.get("to"));
  const searchQuery = url.searchParams.get("q")?.trim() || undefined;
  const sortOrder = validateSortOrder(url.searchParams.get("sort"));

  const logs = await listTenantAuditLogs({
    tenantKey,
    actions,
    fromDate,
    toDate,
    searchQuery,
    sortOrder,
    limit: 5000,
  });

  const header = [
    "createdAt",
    "tenantKey",
    "principalId",
    "role",
    "action",
    "resourceType",
    "resourceId",
    "method",
    "path",
    "metadata",
  ];
  const rows = logs.map((log) =>
    [
      log.createdAt,
      log.tenantKey,
      log.principalId,
      log.role,
      log.action,
      log.resourceType,
      log.resourceId,
      log.method,
      log.path,
      summarizeMetadata(log.metadata),
    ]
      .map(escapeCsv)
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\n");
  const fileNameParts = ["tenant-audit-logs", tenantKey || "all", sortOrder, fromDate || "start", toDate || "latest"];
  const fileName = `${fileNameParts.join("-")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
