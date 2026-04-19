import { decryptSecret } from "./crypto";
import { fetchTenantConfigRecord } from "./repository";
import type { TenantKey, TenantNotionConfig } from "./types";

const TENANT_HEADER = "x-tenant-key";
const TENANT_COOKIE = "tenant_key";

function read(value?: string | null) {
  return value?.trim() || "";
}

export function normalizeTenantKey(value?: string | null): TenantKey | null {
  const normalized = read(value).toLowerCase();
  if (normalized === "demo" || normalized === "ootsuki") {
    return normalized;
  }
  return null;
}

function parseTenantHostMap() {
  const raw = read(process.env.TENANT_HOST_MAP);
  if (!raw) return {} as Record<string, TenantKey>;

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([host, tenant]) => [host.toLowerCase(), normalizeTenantKey(tenant)])
        .filter((entry): entry is [string, TenantKey] => Boolean(entry[1])),
    );
  } catch {
    return Object.fromEntries(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [host, tenant] = entry.split("=").map((value) => value.trim());
          return [host?.toLowerCase(), normalizeTenantKey(tenant)] as const;
        })
        .filter((entry): entry is readonly [string, TenantKey] => Boolean(entry[0] && entry[1])),
    );
  }
}

function resolveTenantKeyFromHost(hostHeader?: string | null): TenantKey | null {
  const hostname = read(hostHeader).split(":")[0].toLowerCase();
  if (!hostname) return null;

  const hostMap = parseTenantHostMap();
  if (hostMap[hostname]) return hostMap[hostname];

  if (hostname === "demo" || hostname.startsWith("demo.")) return "demo";
  if (hostname === "ootsuki" || hostname.startsWith("ootsuki.")) return "ootsuki";
  return null;
}

async function resolveTenantKeyFromRequest(): Promise<TenantKey | null> {
  try {
    const nextHeaders = await import("next/headers");
    const headerStore = await nextHeaders.headers();
    const cookieStore = await nextHeaders.cookies();

    const headerTenant = normalizeTenantKey(headerStore.get(TENANT_HEADER));
    if (headerTenant) return headerTenant;

    const cookieTenant = normalizeTenantKey(cookieStore.get(TENANT_COOKIE)?.value);
    if (cookieTenant) return cookieTenant;

    const hostTenant = resolveTenantKeyFromHost(
      headerStore.get("x-forwarded-host") || headerStore.get("host"),
    );
    if (hostTenant) return hostTenant;
  } catch {
    // scripts / non-request execution
  }

  return null;
}

function resolveTenantKeyFromEnv(): TenantKey {
  const active = read(process.env.NOTION_ACTIVE_TENANT).toLowerCase();
  if (active === "demo" || active === "ootsuki") return active;

  const label = read(process.env.NOTION_ENV_LABEL).toLowerCase();
  if (label === "demo") return "demo";
  return "ootsuki";
}

export async function resolveTenantKey(): Promise<TenantKey> {
  return (await resolveTenantKeyFromRequest()) || resolveTenantKeyFromEnv();
}

function buildOotsukiEnvConfig(): TenantNotionConfig {
  return {
    tenant: "ootsuki",
    notionToken: read(process.env.NOTION_API_TOKEN) || read(process.env.NOTION_API_KEY),
    projectDbId: read(process.env.NOTION_PROJECT_DB_ID),
    ootsukiProjectPageId: read(process.env.NOTION_OOTSUKI_PROJECT_PAGE_ID),
    dailySalesDbId: read(process.env.NOTION_OOTSUKI_DAILY_SALES_DB_ID),
    kpiDbId: read(process.env.NOTION_OOTSUKI_KPI_DB_ID),
    memoDbId: read(process.env.NOTION_OOTSUKI_MEMO_DB_ID),
    lineReportPageId: read(process.env.NOTION_OOTSUKI_LINE_REPORT_PAGE_ID),
    productCostDbId: read(process.env.NOTION_OOTSUKI_PRODUCT_COST_DB_ID),
    weeklyActionsDbId: read(process.env.NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID),
  };
}

function buildDemoEnvConfig(): TenantNotionConfig {
  return {
    tenant: "demo",
    notionToken: read(process.env.NOTION_DEMO_API_TOKEN) || read(process.env.NOTION_DEMO_API_KEY),
    projectDbId: read(process.env.NOTION_DEMO_PROJECT_DB_ID),
    ootsukiProjectPageId: read(process.env.NOTION_DEMO_OOTSUKI_PROJECT_PAGE_ID),
    dailySalesDbId: read(process.env.NOTION_DEMO_OOTSUKI_DAILY_SALES_DB_ID),
    kpiDbId: read(process.env.NOTION_DEMO_OOTSUKI_KPI_DB_ID),
    memoDbId: read(process.env.NOTION_DEMO_OOTSUKI_MEMO_DB_ID),
    lineReportPageId: read(process.env.NOTION_DEMO_OOTSUKI_LINE_REPORT_PAGE_ID),
    productCostDbId: read(process.env.NOTION_DEMO_OOTSUKI_PRODUCT_COST_DB_ID),
    weeklyActionsDbId: read(process.env.NOTION_DEMO_OOTSUKI_WEEKLY_ACTIONS_DB_ID),
  };
}

export function getEnvTenantNotionConfig(tenant: TenantKey): TenantNotionConfig {
  if (tenant === "demo") return buildDemoEnvConfig();
  return buildOotsukiEnvConfig();
}

function mergeWithFallback(recordConfig: TenantNotionConfig, fallback: TenantNotionConfig): TenantNotionConfig {
  return {
    tenant: recordConfig.tenant,
    notionToken: recordConfig.notionToken || fallback.notionToken,
    projectDbId: recordConfig.projectDbId || fallback.projectDbId,
    ootsukiProjectPageId: recordConfig.ootsukiProjectPageId || fallback.ootsukiProjectPageId,
    dailySalesDbId: recordConfig.dailySalesDbId || fallback.dailySalesDbId,
    kpiDbId: recordConfig.kpiDbId || fallback.kpiDbId,
    memoDbId: recordConfig.memoDbId || fallback.memoDbId,
    lineReportPageId: recordConfig.lineReportPageId || fallback.lineReportPageId,
    productCostDbId: recordConfig.productCostDbId || fallback.productCostDbId,
    weeklyActionsDbId: recordConfig.weeklyActionsDbId || fallback.weeklyActionsDbId,
  };
}

export async function getTenantNotionConfig(tenant: TenantKey): Promise<TenantNotionConfig> {
  const fallback = getEnvTenantNotionConfig(tenant);
  const record = await fetchTenantConfigRecord(tenant);
  if (!record) return fallback;

  let notionToken = fallback.notionToken;
  if (record.notionTokenEnc) {
    try {
      notionToken = decryptSecret(record.notionTokenEnc);
    } catch (error) {
      console.warn("[tenant-config] failed to decrypt token; fallback to env", error);
    }
  }

  return mergeWithFallback(
    {
      tenant,
      notionToken,
      projectDbId: record.projectDbId,
      ootsukiProjectPageId: record.ootsukiProjectPageId,
      dailySalesDbId: record.dailySalesDbId,
      kpiDbId: record.kpiDbId,
      memoDbId: record.memoDbId,
      lineReportPageId: record.lineReportPageId,
      productCostDbId: record.productCostDbId,
      weeklyActionsDbId: record.weeklyActionsDbId,
    },
    fallback,
  );
}
