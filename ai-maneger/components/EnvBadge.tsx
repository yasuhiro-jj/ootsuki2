import { getActiveTenantKey } from "@/lib/notion/tenant";

export async function EnvBadge() {
  const tenant = await getActiveTenantKey();
  if (tenant !== "demo") return null;

  return (
    <span className="inline-flex items-center rounded bg-yellow-200 px-2 py-0.5 text-xs font-bold text-yellow-900">
      DEMO ENV
    </span>
  );
}
