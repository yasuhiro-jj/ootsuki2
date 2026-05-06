import { Client } from "@notionhq/client";
import { loadEnvConfig } from "@next/env";
import { getActiveTenantNotionConfig } from "../lib/notion/tenant";
import { getTenantNotionConfig } from "../lib/tenant-config/service";
import type { TenantKey, TenantNotionConfig } from "../lib/tenant-config/types";

loadEnvConfig(process.cwd());

type Target = {
  key: keyof TenantNotionConfig;
  type: "database" | "page";
  optional?: boolean;
};

const targets: Target[] = [
  { key: "projectDbId", type: "database" },
  { key: "ootsukiProjectPageId", type: "page" },
  { key: "dailySalesDbId", type: "database" },
  { key: "kpiDbId", type: "database" },
  { key: "memoDbId", type: "database" },
  { key: "lineReportPageId", type: "page" },
  { key: "productCostDbId", type: "database" },
  { key: "weeklyActionsDbId", type: "database" },
  { key: "instructionsPageId", type: "page", optional: true },
];

function toNotionId(raw: string): string {
  const value = raw.trim();
  if (value.includes("-")) return value;
  if (!/^[a-fA-F0-9]{32}$/.test(value)) return value;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function readTitleFromPageProperties(properties: unknown): string {
  if (!properties || typeof properties !== "object") return "(no title)";
  const map = properties as Record<string, unknown>;
  for (const key of ["title", "Name", "名前", "タイトル"]) {
    const prop = map[key];
    if (!prop || typeof prop !== "object") continue;
    const titleArray = (prop as { title?: Array<{ plain_text?: string }> }).title;
    if (Array.isArray(titleArray) && titleArray[0]?.plain_text) {
      return titleArray[0].plain_text;
    }
  }
  return "(no title)";
}

type CheckResult = {
  tenant: TenantKey;
  ok: number;
  ng: number;
};

function parseTenantArg(): "active" | "all" | TenantKey {
  const tenantArg = process.argv.find((arg) => arg.startsWith("--tenant="))?.split("=")[1];
  if (!tenantArg) return "active";
  if (tenantArg === "all") return "all";
  if (tenantArg === "demo" || tenantArg === "ootsuki") return tenantArg;
  throw new Error("`--tenant` は demo / ootsuki / all のいずれかを指定してください。");
}

async function checkTenant(tenantConfig: TenantNotionConfig): Promise<CheckResult> {
  if (!tenantConfig.notionToken) {
    console.error(`❌ ${tenantConfig.tenant} tenant の notionToken が未設定です。`);
    return { tenant: tenantConfig.tenant, ok: 0, ng: 1 };
  }

  const notion = new Client({ auth: tenantConfig.notionToken });
  const label = process.env.NOTION_ENV_LABEL ?? "(unset)";
  console.log(`\n[check:notion-env] LABEL=${label} TENANT=${tenantConfig.tenant}`);

  let ok = 0;
  let ng = 0;

  for (const target of targets) {
    const rawId = tenantConfig[target.key];
    if (!rawId) {
      if (target.optional) {
        console.log(`⚪ ${target.key} : (任意・未設定)`);
        continue;
      }
      console.error(`❌ ${target.key} : NOT SET`);
      ng += 1;
      continue;
    }

    const notionId = toNotionId(rawId);

    try {
      if (target.type === "database") {
        const db = await notion.databases.retrieve({ database_id: notionId });
        const dbTitle = "title" in db ? db.title?.[0]?.plain_text ?? "(no title)" : "(no title)";
        console.log(`✅ ${target.key} : ${dbTitle}`);
      } else {
        const page = await notion.pages.retrieve({ page_id: notionId });
        const pageTitle = readTitleFromPageProperties((page as { properties?: unknown }).properties);
        console.log(`✅ ${target.key} : ${pageTitle}`);
      }
      ok += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown_error";
      const code = (error as { code?: string })?.code;
      console.error(`❌ ${target.key} : ${code ?? message}`);
      ng += 1;
    }
  }

  console.log(`\nResult: ${ok} OK / ${ng} NG`);
  return { tenant: tenantConfig.tenant, ok, ng };
}

async function main() {
  const tenantMode = parseTenantArg();
  if (tenantMode === "active") {
    const result = await checkTenant(await getActiveTenantNotionConfig());
    process.exit(result.ng === 0 ? 0 : 1);
  }

  const tenants: TenantKey[] = tenantMode === "all" ? ["demo", "ootsuki"] : [tenantMode];
  const results: CheckResult[] = [];
  for (const tenant of tenants) {
    results.push(await checkTenant(await getTenantNotionConfig(tenant)));
  }

  if (results.length > 1) {
    const totalOk = results.reduce((sum, result) => sum + result.ok, 0);
    const totalNg = results.reduce((sum, result) => sum + result.ng, 0);
    console.log("\n=== Summary ===");
    for (const result of results) {
      console.log(`${result.tenant}: ${result.ok} OK / ${result.ng} NG`);
    }
    console.log(`TOTAL: ${totalOk} OK / ${totalNg} NG`);
  }

  const hasNg = results.some((result) => result.ng > 0);
  process.exit(hasNg ? 1 : 0);
}

main();
