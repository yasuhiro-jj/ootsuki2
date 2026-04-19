import {
  getTenantNotionConfig,
  resolveTenantKey,
} from "@/lib/tenant-config/service";
import type { TenantKey, TenantNotionConfig } from "@/lib/tenant-config/types";

export type { TenantKey, TenantNotionConfig };

export async function getActiveTenantKey(): Promise<TenantKey> {
  return await resolveTenantKey();
}

export async function getActiveTenantNotionConfig(): Promise<TenantNotionConfig> {
  return getTenantNotionConfig(await getActiveTenantKey());
}
