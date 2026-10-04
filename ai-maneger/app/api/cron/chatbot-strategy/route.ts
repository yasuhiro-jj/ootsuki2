import { NextResponse } from "next/server";
import { runChatbotStrategyGeneration, getStrategyMode } from "@/lib/chatbot-strategy/runner";
import { isTenantConfigStoreEnabled } from "@/lib/tenant-config/repository";
import type { TenantKey } from "@/lib/tenant-config/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseCronTenants(): TenantKey[] {
  const raw = process.env.CHATBOT_STRATEGY_CRON_TENANTS?.trim();
  const defaults: TenantKey[] = ["ootsuki"];
  if (!raw) return defaults;
  const out: TenantKey[] = [];
  for (const key of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (key === "ootsuki" || key === "demo") out.push(key);
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

  const mode = getStrategyMode();
  if (mode === "off") {
    return NextResponse.json({
      ok: true,
      mode,
      message: "CHATBOT_AUTO_STRATEGY_MODE が off のため何もしません。",
      results: [],
    });
  }

  if (!isTenantConfigStoreEnabled()) {
    return NextResponse.json(
      { ok: false, message: "TENANT_CONFIG_STORE_ENABLED=true が必要です" },
      { status: 503 },
    );
  }

  const results = [];
  for (const tenant of parseCronTenants()) {
    try {
      results.push(await runChatbotStrategyGeneration({ tenant }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[cron/chatbot-strategy]", tenant, message);
      results.push({ ok: false, mode, tenant, reason: "unexpected_error", message });
    }
  }

  return NextResponse.json({ ok: true, mode, results });
}
