import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { Pool } from "pg";
import type {
  TenantAuditLogRecord,
  TenantConfigRecord,
  TenantKey,
  TenantMembershipRecord,
  TenantRole,
} from "./types";

// IPv6 のみ AAAA が返る環境で、Node の IPv4 優先 DNS が ENOTFOUND になるのを避ける
dns.setDefaultResultOrder("verbatim");

let pool: Pool | null = null;
let poolInitPromise: Promise<Pool> | null = null;

function read(value?: string) {
  return value?.trim() || "";
}

export function isTenantConfigStoreEnabled() {
  return read(process.env.TENANT_CONFIG_STORE_ENABLED).toLowerCase() === "true";
}

/**
 * Supabase の db.*.supabase.co が AAAA のみのとき、pg の getaddrinfo が ENOTFOUND になることがある。
 * resolve6 / resolve4 で取ったアドレスをホストに埋め込んで接続する。
 */
async function resolvePostgresConnectionString(raw: string): Promise<string> {
  const unquoted = raw.replace(/^["']|["']$/g, "");
  try {
    const url = new URL(unquoted.replace(/^postgresql:/i, "http:"));
    const hostname = url.hostname;
    if (!hostname) return unquoted;

    const v6 = await dnsPromises.resolve6(hostname).catch(() => [] as string[]);
    if (v6.length > 0) {
      url.hostname = `[${v6[0]}]`;
      return url.toString().replace(/^https:/i, "postgresql:");
    }

    const v4 = await dnsPromises.resolve4(hostname).catch(() => [] as string[]);
    if (v4.length > 0) {
      url.hostname = v4[0];
      return url.toString().replace(/^https:/i, "postgresql:");
    }
  } catch {
    // fall through
  }
  return unquoted;
}

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  if (!poolInitPromise) {
    poolInitPromise = (async () => {
      const raw = read(process.env.TENANT_CONFIG_DB_URL);
      if (!raw) {
        throw new Error("TENANT_CONFIG_DB_URL が未設定です");
      }
      const connectionString = await resolvePostgresConnectionString(raw);
      pool = new Pool({ connectionString });
      return pool;
    })();
  }
  return poolInitPromise;
}

function rowToRecord(row: Record<string, unknown>): TenantConfigRecord {
  return {
    tenantKey: String(row.tenant_key) as TenantKey,
    notionTokenEnc: String(row.notion_token_enc || ""),
    projectDbId: String(row.project_db_id || ""),
    ootsukiProjectPageId: String(row.ootsuki_project_page_id || ""),
    dailySalesDbId: String(row.daily_sales_db_id || ""),
    kpiDbId: String(row.kpi_db_id || ""),
    memoDbId: String(row.memo_db_id || ""),
    lineReportPageId: String(row.line_report_page_id || ""),
    productCostDbId: String(row.product_cost_db_id || ""),
    weeklyActionsDbId: String(row.weekly_actions_db_id || ""),
    isActive: Boolean(row.is_active),
    updatedAt: String(row.updated_at || ""),
  };
}

function rowToMembershipRecord(row: Record<string, unknown>): TenantMembershipRecord {
  return {
    tenantKey: String(row.tenant_key) as TenantKey,
    principalId: String(row.principal_id || ""),
    role: String(row.role || "viewer") as TenantRole,
    isActive: Boolean(row.is_active),
    updatedAt: String(row.updated_at || ""),
  };
}

function rowToAuditLogRecord(row: Record<string, unknown>): TenantAuditLogRecord {
  const metadata = row.metadata;
  return {
    id: String(row.id || ""),
    tenantKey: String(row.tenant_key) as TenantKey,
    principalId: String(row.principal_id || ""),
    role: String(row.role || ""),
    action: String(row.action || ""),
    resourceType: String(row.resource_type || ""),
    resourceId: String(row.resource_id || ""),
    path: String(row.path || ""),
    method: String(row.method || ""),
    metadata: typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : {},
    createdAt: String(row.created_at || ""),
  };
}

export async function fetchTenantConfigRecord(tenantKey: TenantKey): Promise<TenantConfigRecord | null> {
  if (!isTenantConfigStoreEnabled()) return null;

  const client = await getPool();
  const result = await client.query(
    `SELECT tenant_key, notion_token_enc, project_db_id, ootsuki_project_page_id,
            daily_sales_db_id, kpi_db_id, memo_db_id, line_report_page_id,
            product_cost_db_id, weekly_actions_db_id, is_active, updated_at
       FROM tenant_configs
      WHERE tenant_key = $1 AND is_active = TRUE
      LIMIT 1`,
    [tenantKey],
  );
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}

export async function listTenantConfigRecords(): Promise<TenantConfigRecord[]> {
  if (!isTenantConfigStoreEnabled()) return [];
  const client = await getPool();
  const result = await client.query(
    `SELECT tenant_key, notion_token_enc, project_db_id, ootsuki_project_page_id,
            daily_sales_db_id, kpi_db_id, memo_db_id, line_report_page_id,
            product_cost_db_id, weekly_actions_db_id, is_active, updated_at
       FROM tenant_configs
      ORDER BY tenant_key ASC`,
  );
  return result.rows.map(rowToRecord);
}

export async function upsertTenantConfigRecord(record: Omit<TenantConfigRecord, "updatedAt">) {
  if (!isTenantConfigStoreEnabled()) {
    throw new Error("TENANT_CONFIG_STORE_ENABLED=true で有効化してください");
  }

  const client = await getPool();
  await client.query(
    `INSERT INTO tenant_configs (
      tenant_key, notion_token_enc, project_db_id, ootsuki_project_page_id,
      daily_sales_db_id, kpi_db_id, memo_db_id, line_report_page_id,
      product_cost_db_id, weekly_actions_db_id, is_active, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
    )
    ON CONFLICT (tenant_key) DO UPDATE SET
      notion_token_enc = EXCLUDED.notion_token_enc,
      project_db_id = EXCLUDED.project_db_id,
      ootsuki_project_page_id = EXCLUDED.ootsuki_project_page_id,
      daily_sales_db_id = EXCLUDED.daily_sales_db_id,
      kpi_db_id = EXCLUDED.kpi_db_id,
      memo_db_id = EXCLUDED.memo_db_id,
      line_report_page_id = EXCLUDED.line_report_page_id,
      product_cost_db_id = EXCLUDED.product_cost_db_id,
      weekly_actions_db_id = EXCLUDED.weekly_actions_db_id,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()`,
    [
      record.tenantKey,
      record.notionTokenEnc,
      record.projectDbId,
      record.ootsukiProjectPageId,
      record.dailySalesDbId,
      record.kpiDbId,
      record.memoDbId,
      record.lineReportPageId,
      record.productCostDbId,
      record.weeklyActionsDbId,
      record.isActive,
    ],
  );
}

export async function fetchTenantMembershipRecord(
  tenantKey: TenantKey,
  principalId: string,
): Promise<TenantMembershipRecord | null> {
  if (!isTenantConfigStoreEnabled()) return null;
  const client = await getPool();
  const result = await client.query(
    `SELECT tenant_key, principal_id, role, is_active, updated_at
       FROM tenant_memberships
      WHERE tenant_key = $1 AND principal_id = $2 AND is_active = TRUE
      LIMIT 1`,
    [tenantKey, principalId],
  );
  return result.rows[0] ? rowToMembershipRecord(result.rows[0]) : null;
}

export async function listTenantMembershipRecords(tenantKey?: TenantKey): Promise<TenantMembershipRecord[]> {
  if (!isTenantConfigStoreEnabled()) return [];
  const client = await getPool();
  const result = tenantKey
    ? await client.query(
        `SELECT tenant_key, principal_id, role, is_active, updated_at
           FROM tenant_memberships
          WHERE tenant_key = $1
          ORDER BY tenant_key ASC, principal_id ASC`,
        [tenantKey],
      )
    : await client.query(
        `SELECT tenant_key, principal_id, role, is_active, updated_at
           FROM tenant_memberships
          ORDER BY tenant_key ASC, principal_id ASC`,
      );
  return result.rows.map(rowToMembershipRecord);
}

export async function upsertTenantMembershipRecord(record: Omit<TenantMembershipRecord, "updatedAt">) {
  if (!isTenantConfigStoreEnabled()) {
    throw new Error("TENANT_CONFIG_STORE_ENABLED=true で有効化してください");
  }
  const client = await getPool();
  await client.query(
    `INSERT INTO tenant_memberships (
      tenant_key, principal_id, role, is_active, updated_at
    ) VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (tenant_key, principal_id) DO UPDATE SET
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()`,
    [record.tenantKey, record.principalId, record.role, record.isActive],
  );
}

export async function insertTenantAuditLog(record: {
  tenantKey: TenantKey;
  principalId: string;
  role: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  path: string;
  method: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isTenantConfigStoreEnabled()) return;
  const client = await getPool();
  await client.query(
    `INSERT INTO tenant_audit_logs (
      tenant_key, principal_id, role, action, resource_type, resource_id, path, method, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      record.tenantKey,
      record.principalId,
      record.role,
      record.action,
      record.resourceType,
      record.resourceId || null,
      record.path,
      record.method,
      JSON.stringify(record.metadata || {}),
    ],
  );
}

export async function listTenantAuditLogs(options?: {
  tenantKey?: TenantKey;
  actions?: string[];
  fromDate?: string;
  toDate?: string;
  searchQuery?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}): Promise<TenantAuditLogRecord[]> {
  if (!isTenantConfigStoreEnabled()) return [];
  const client = await getPool();
  const tenantKey = options?.tenantKey;
  const actions = (options?.actions || []).map((entry) => entry.trim()).filter(Boolean);
  const fromDate = options?.fromDate?.trim();
  const toDate = options?.toDate?.trim();
  const searchQuery = options?.searchQuery?.trim();
  const sortOrder = options?.sortOrder === "asc" ? "asc" : "desc";
  const limit = options?.limit;
  const where: string[] = [];
  const values: Array<string | number> = [];

  if (tenantKey) {
    values.push(tenantKey);
    where.push(`tenant_key = $${values.length}`);
  }

  if (actions.length > 0) {
    const placeholders = actions.map((action) => {
      values.push(action);
      return `$${values.length}`;
    });
    where.push(`action IN (${placeholders.join(", ")})`);
  }

  if (fromDate) {
    values.push(fromDate);
    where.push(`created_at >= $${values.length}::date`);
  }

  if (toDate) {
    values.push(toDate);
    where.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }

  if (searchQuery) {
    values.push(`%${searchQuery}%`);
    where.push(`(
      principal_id ILIKE $${values.length}
      OR role ILIKE $${values.length}
      OR action ILIKE $${values.length}
      OR resource_type ILIKE $${values.length}
      OR COALESCE(resource_id, '') ILIKE $${values.length}
      OR path ILIKE $${values.length}
      OR method ILIKE $${values.length}
      OR metadata::text ILIKE $${values.length}
    )`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limitClause =
    typeof limit === "number"
      ? (() => {
          values.push(limit);
          return `LIMIT $${values.length}`;
        })()
      : "";
  const result = await client.query(
    `SELECT id, tenant_key, principal_id, role, action, resource_type, resource_id, path, method, metadata, created_at
       FROM tenant_audit_logs
       ${whereClause}
      ORDER BY created_at ${sortOrder.toUpperCase()}
      ${limitClause}`,
    values,
  );
  return result.rows.map(rowToAuditLogRecord);
}
