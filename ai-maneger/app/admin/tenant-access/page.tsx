import { AppShell } from "@/components/common/app-shell";
import { ErrorPanel } from "@/components/common/error-panel";
import { SectionCard } from "@/components/common/section-card";
import { TenantMembershipManager } from "@/components/admin/tenant-membership-manager";
import { getCurrentTenantAccessResult } from "@/lib/api/tenant-access";
import {
  isTenantConfigStoreEnabled,
  listTenantAuditLogs,
  listTenantConfigRecords,
  listTenantMembershipRecords,
} from "@/lib/tenant-config/repository";
import type { TenantKey } from "@/lib/tenant-config/types";

export const dynamic = "force-dynamic";

const AUDIT_ACTION_OPTIONS = [
  "daily_input.save",
  "daily_input.batch_save",
  "weekly_review.save",
  "weekly_actions.save",
  "weekly_summary.upsert",
  "weekly_summary.upsert_from_ui",
  "tenant_config.upsert",
  "tenant_membership.upsert",
] as const;

type AuditActionOption = (typeof AUDIT_ACTION_OPTIONS)[number];
type AuditSortOrder = "asc" | "desc";

function normalizeTenantFilter(value?: string): TenantKey | undefined {
  return value === "ootsuki" || value === "demo" ? value : undefined;
}

function normalizeActionFilters(value?: string | string[]) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter((entry): entry is AuditActionOption => AUDIT_ACTION_OPTIONS.includes(entry as AuditActionOption));
}

function normalizeDateFilter(value?: string): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function getSingleSearchParam(value?: string | string[]) {
  return typeof value === "string" ? value : undefined;
}

function normalizeSortOrder(value?: string): AuditSortOrder {
  return value === "asc" ? "asc" : "desc";
}

function buildAuditExportHref(filters: {
  currentTenant: TenantKey;
  tenant?: TenantKey;
  actions: AuditActionOption[];
  fromDate?: string;
  toDate?: string;
  searchQuery?: string;
  sortOrder: AuditSortOrder;
}) {
  const params = new URLSearchParams();
  params.set("tenant", filters.currentTenant);
  if (filters.tenant) params.set("auditTenant", filters.tenant);
  for (const action of filters.actions) params.append("action", action);
  if (filters.fromDate) params.set("from", filters.fromDate);
  if (filters.toDate) params.set("to", filters.toDate);
  if (filters.searchQuery) params.set("q", filters.searchQuery);
  params.set("sort", filters.sortOrder);
  const query = params.toString();
  return query ? `/api/admin/tenant-audit-logs/export?${query}` : "/api/admin/tenant-audit-logs/export";
}

function summarizeAuditMetadata(metadata: Record<string, unknown>) {
  const entries: string[] = [];

  const pushIfPresent = (label: string, key: string) => {
    const value = metadata[key];
    if (value === undefined || value === null || value === "") return;
    entries.push(`${label}: ${String(value)}`);
  };

  pushIfPresent("日付", "date");
  pushIfPresent("基準日", "referenceDate");
  pushIfPresent("週末", "weekEnd");
  pushIfPresent("状態", "status");
  pushIfPresent("売上", "sales");
  pushIfPresent("客数", "customers");
  pushIfPresent("件数", "total");
  pushIfPresent("成功", "succeeded");
  pushIfPresent("失敗", "failed");
  pushIfPresent("アクション数", "actionsCount");
  pushIfPresent("次アクション数", "nextActionsCount");
  pushIfPresent("対象tenant", "targetTenant");
  pushIfPresent("対象role", "targetRole");
  pushIfPresent("有効", "isActive");
  pushIfPresent("入力元", "source");

  return entries;
}

export default async function TenantAccessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const access = await getCurrentTenantAccessResult("admin");
  const enabled = isTenantConfigStoreEnabled();
  const tenantFilter = normalizeTenantFilter(getSingleSearchParam(searchParams?.auditTenant));
  const actionFilters = normalizeActionFilters(searchParams?.action);
  const fromDateFilter = normalizeDateFilter(getSingleSearchParam(searchParams?.from));
  const toDateFilter = normalizeDateFilter(getSingleSearchParam(searchParams?.to));
  const searchQuery = getSingleSearchParam(searchParams?.q)?.trim() || "";
  const sortOrder = normalizeSortOrder(getSingleSearchParam(searchParams?.sort));

  if (!enabled) {
    return (
      <AppShell title="権限管理" description="tenant membership の状態を確認し、principal ごとの role を管理します。">
        <SectionCard title="DB設定ストア未有効">
          <p className="text-sm leading-7 text-stone-600">
            `TENANT_CONFIG_STORE_ENABLED=true` にしてから利用してください。
          </p>
        </SectionCard>
      </AppShell>
    );
  }

  if (!access.ok) {
    return (
      <AppShell title="権限管理" description="tenant membership の状態を確認し、principal ごとの role を管理します。">
        <ErrorPanel title="権限管理を開けません" message={access.message} />
      </AppShell>
    );
  }

  const currentTenant = access.tenant as TenantKey;
  const auditExportHref = buildAuditExportHref({
    currentTenant,
    tenant: tenantFilter,
    actions: actionFilters,
    fromDate: fromDateFilter,
    toDate: toDateFilter,
    searchQuery: searchQuery || undefined,
    sortOrder,
  });

  const [tenantConfigs, memberships, auditLogs] = await Promise.all([
    listTenantConfigRecords(),
    listTenantMembershipRecords(),
    listTenantAuditLogs({
      tenantKey: tenantFilter,
      actions: actionFilters,
      fromDate: fromDateFilter,
      toDate: toDateFilter,
      searchQuery: searchQuery || undefined,
      sortOrder,
      limit: 30,
    }),
  ]);

  return (
    <AppShell title="権限管理" description="tenant membership の状態を確認し、principal ごとの role を管理します。">
      <SectionCard title="現在の設定状況" description={`tenant設定 ${tenantConfigs.length}件 / membership ${memberships.length}件`}>
        <div className="grid gap-3 md:grid-cols-3">
          {tenantConfigs.map((config) => (
            <div key={config.tenantKey} className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Tenant</p>
              <p className="mt-2 text-base font-semibold text-stone-900">{config.tenantKey}</p>
              <p className="mt-2 text-sm text-stone-600">active: {config.isActive ? "yes" : "no"}</p>
              <p className="mt-1 text-xs text-stone-500">updated: {config.updatedAt}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <section className="mt-6">
        <SectionCard
          title="Membership 一覧と更新"
          description="tenant_key / principal_id ごとに role を保存します。保存後は画面を再読込して最新状態を反映します。"
        >
          <TenantMembershipManager currentTenant={access.tenant} initialMemberships={memberships} />
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard
          title="直近の監査ログ"
          description="主要な更新系APIの実行履歴です。誰がどの tenant で何を更新したかを確認できます。"
        >
          <form method="GET" className="mb-4 space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_1fr]">
            <label className="text-sm text-stone-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">Tenant</span>
              <select
                name="auditTenant"
                defaultValue={tenantFilter || ""}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              >
                <option value="">すべて</option>
                <option value="ootsuki">ootsuki</option>
                <option value="demo">demo</option>
              </select>
            </label>
            <label className="text-sm text-stone-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">From</span>
              <input
                type="date"
                name="from"
                defaultValue={fromDateFilter || ""}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              />
            </label>
            <label className="text-sm text-stone-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">To</span>
              <input
                type="date"
                name="to"
                defaultValue={toDateFilter || ""}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              />
            </label>
            <label className="text-sm text-stone-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">Search</span>
              <input
                type="text"
                name="q"
                defaultValue={searchQuery}
                placeholder="user, target, path, metadata..."
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              />
            </label>
            <label className="text-sm text-stone-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-stone-500">Sort</span>
              <select
                name="sort"
                defaultValue={sortOrder}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              >
                <option value="desc">新しい順</option>
                <option value="asc">古い順</option>
              </select>
            </label>
            </div>

            <fieldset>
              <legend className="mb-2 block text-xs uppercase tracking-[0.18em] text-stone-500">Action 複数選択</legend>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {AUDIT_ACTION_OPTIONS.map((action) => (
                  <label
                    key={action}
                    className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
                  >
                    <input
                      type="checkbox"
                      name="action"
                      value={action}
                      defaultChecked={actionFilters.includes(action)}
                      className="h-4 w-4 rounded border-stone-300"
                    />
                    <span className="break-all">{action}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              絞り込む
            </button>
            <a
              href="/admin/tenant-access"
              className="rounded-xl border border-stone-300 px-4 py-2 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              解除
            </a>
            </div>
          </form>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-600">
              表示件数: {auditLogs.length}件 / 並び順: {sortOrder === "desc" ? "新しい順" : "古い順"}
            </p>
            <a
              href={auditExportHref}
              className="rounded-xl border border-stone-900 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:bg-stone-100"
            >
              CSV 出力
            </a>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">日時</th>
                  <th className="px-3 py-2 font-medium">Tenant</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-b border-stone-100 align-top">
                    <td className="px-3 py-2 text-stone-600">{log.createdAt}</td>
                    <td className="px-3 py-2 font-medium text-stone-900">{log.tenantKey}</td>
                    <td className="px-3 py-2 text-stone-700">{log.principalId}</td>
                    <td className="px-3 py-2 text-stone-700">{log.role}</td>
                    <td className="px-3 py-2 text-stone-700">{log.action}</td>
                    <td className="px-3 py-2 text-stone-600">{log.resourceId || log.path}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">
                      {summarizeAuditMetadata(log.metadata).length > 0 ? (
                        <div className="space-y-1">
                          {summarizeAuditMetadata(log.metadata).map((item) => (
                            <div key={item}>{item}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-stone-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-500">
                      <div>{log.method}</div>
                      <div className="mt-1 break-all">{log.path}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditLogs.length === 0 ? (
              <p className="px-3 py-4 text-sm text-stone-500">まだ監査ログはありません。</p>
            ) : null}
          </div>
        </SectionCard>
      </section>
    </AppShell>
  );
}
