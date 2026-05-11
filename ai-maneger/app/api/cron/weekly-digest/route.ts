import { NextResponse } from "next/server";
import { runMemoryDigestGeneration } from "@/lib/db/memory-digest-runner";
import { getPreviousCompletedWeekUtcRange } from "@/lib/datetime/utc-week";
import { isTenantConfigStoreEnabled } from "@/lib/tenant-config/repository";
import type { TenantKey } from "@/lib/tenant-config/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseCronTenants(): TenantKey[] {
  const raw = process.env.DIGEST_CRON_TENANTS?.trim();
  const defaults: TenantKey[] = ["ootsuki"];
  if (!raw) return defaults;
  const keys = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: TenantKey[] = [];
  for (const k of keys) {
    if (k === "ootsuki" || k === "demo") out.push(k);
  }
  return out.length > 0 ? out : defaults;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, message: "CRON_SECRET が未設定です" }, { status: 503 });
  }

  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!isTenantConfigStoreEnabled()) {
    return NextResponse.json(
      { ok: false, message: "TENANT_CONFIG_STORE_ENABLED=true が必要です" },
      { status: 503 },
    );
  }

  const { periodStart, periodEnd } = getPreviousCompletedWeekUtcRange();
  const tenants = parseCronTenants();
  const digestType = "weekly";

  const results: Array<{
    tenant: TenantKey;
    periodStart: string;
    periodEnd: string;
    digestType: string;
    status: "generated" | "skipped" | "failed";
    digestId?: string;
    sourceCount?: number;
    detail?: string;
  }> = [];

  for (const tenant of tenants) {
    try {
      const result = await runMemoryDigestGeneration({
        tenantKey: tenant,
        periodStart,
        periodEnd,
        digestType,
      });

      if (result.ok) {
        results.push({
          tenant,
          periodStart,
          periodEnd,
          digestType,
          status: "generated",
          digestId: result.digestId,
          sourceCount: result.sourceCount,
        });
      } else if (result.reason === "no_conversations") {
        results.push({
          tenant,
          periodStart,
          periodEnd,
          digestType,
          status: "skipped",
          detail: result.message,
        });
      } else {
        results.push({
          tenant,
          periodStart,
          periodEnd,
          digestType,
          status: "failed",
          detail: result.message,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[cron/weekly-digest]", tenant, message);
      results.push({
        tenant,
        periodStart,
        periodEnd,
        digestType,
        status: "failed",
        detail: message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    periodStart,
    periodEnd,
    digestType,
    tenants,
    results,
  });
}
