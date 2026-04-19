import { loadEnvConfig } from "@next/env";
import { encryptSecret } from "../lib/tenant-config/crypto";
import {
  upsertTenantConfigRecord,
  upsertTenantMembershipRecord,
} from "../lib/tenant-config/repository";
import { getEnvTenantNotionConfig } from "../lib/tenant-config/service";
import type { TenantKey } from "../lib/tenant-config/types";

loadEnvConfig(process.cwd());

async function seedTenant(tenant: TenantKey) {
  const config = getEnvTenantNotionConfig(tenant);
  if (!config.notionToken) {
    throw new Error(`${tenant} の Notion トークンが未設定です`);
  }

  await upsertTenantConfigRecord({
    tenantKey: tenant,
    notionTokenEnc: encryptSecret(config.notionToken),
    projectDbId: config.projectDbId,
    ootsukiProjectPageId: config.ootsukiProjectPageId,
    dailySalesDbId: config.dailySalesDbId,
    kpiDbId: config.kpiDbId,
    memoDbId: config.memoDbId,
    lineReportPageId: config.lineReportPageId,
    productCostDbId: config.productCostDbId,
    weeklyActionsDbId: config.weeklyActionsDbId,
    isActive: true,
  });
}

async function seedMemberships() {
  const bootstrapPrincipals = (process.env.AUTH_BOOTSTRAP_OWNER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const tenant of ["ootsuki", "demo"] as const) {
    for (const principalId of bootstrapPrincipals) {
      await upsertTenantMembershipRecord({
        tenantKey: tenant,
        principalId,
        role: "owner",
        isActive: true,
      });
    }
  }

  const demoViewers = (process.env.AUTH_BOOTSTRAP_DEMO_VIEWER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const principalId of demoViewers) {
    await upsertTenantMembershipRecord({
      tenantKey: "demo",
      principalId,
      role: "viewer",
      isActive: true,
    });
  }
}

async function main() {
  if ((process.env.TENANT_CONFIG_STORE_ENABLED || "").toLowerCase() !== "true") {
    throw new Error("TENANT_CONFIG_STORE_ENABLED=true にしてから実行してください");
  }

  for (const tenant of ["ootsuki", "demo"] as const) {
    try {
      await seedTenant(tenant);
      console.log(`seeded tenant config: ${tenant}`);
    } catch (error) {
      console.warn(`[seed-tenant-config] skipped tenant config for ${tenant}:`, error);
    }
  }

  await seedMemberships();
  console.log("seeded tenant memberships");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
