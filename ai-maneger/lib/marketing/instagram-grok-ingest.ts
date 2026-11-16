import { validateInstagramGrokBody } from "@/lib/marketing/instagram-grok-map";
import { saveInstagramGrokMetricsToNotion } from "@/lib/marketing/instagram-notion-snapshot";
import type { InstagramGrokIngestBody } from "@/lib/marketing/instagram-grok-types";
import { clearMarketingMetricsCache } from "@/lib/marketing/metrics";

export async function ingestInstagramGrokMetrics(body: unknown) {
  const parsed: InstagramGrokIngestBody = validateInstagramGrokBody(body);
  const tenant = parsed.tenant || "ootsuki";
  const saved = await saveInstagramGrokMetricsToNotion(tenant, parsed);
  clearMarketingMetricsCache();
  return {
    tenant,
    pageId: saved.pageId,
    url: saved.url,
    captured_at: (parsed.captured_at || "").slice(0, 10) || undefined,
  };
}