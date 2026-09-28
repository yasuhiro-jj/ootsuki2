import { OsDashboard } from "@/components/os/os-dashboard";
import { getOsDashboardData } from "@/lib/os/data";
import { getActiveTenantKey } from "@/lib/notion/tenant";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI会社OS ダッシュボード",
};

/**
 * /os … AI会社OS 1枚ダッシュボード
 * - 認証は既存 middleware.ts（auth_session cookie）がそのまま効く
 * - tenant は既存の解決順（query → header → cookie → host → env）
 */
export default async function OsDashboardPage() {
  const tenantKey = await getActiveTenantKey();
  const data = await getOsDashboardData(tenantKey);
  return <OsDashboard initialData={data} apiBase="/api/os" />;
}
