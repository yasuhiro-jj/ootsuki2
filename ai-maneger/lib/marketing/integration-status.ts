import type { IntegrationStatus, MarketingStore } from "@/types/marketing";

async function checkInternalHealth(baseUrl?: string, apiKey?: string, healthPath = "health"): Promise<IntegrationStatus["status"]> {
  const trimmedBaseUrl = baseUrl?.trim();
  const trimmedApiKey = apiKey?.trim();
  if (!trimmedBaseUrl || !trimmedApiKey) return "disconnected";

  try {
    const url = new URL(healthPath.replace(/^\//, ""), trimmedBaseUrl.endsWith("/") ? trimmedBaseUrl : `${trimmedBaseUrl}/`);
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${trimmedApiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) return "expired";
    return response.ok ? "connected" : "error";
  } catch {
    return "error";
  }
}

export async function getIntegrationStatuses(store: MarketingStore): Promise<IntegrationStatus[]> {
  const checkedAt = new Date().toISOString();
  const [instagramStatus, gbpStatus] = await Promise.all([
    checkInternalHealth(
      process.env.INSTAGRAM_INTERNAL_API_URL,
      process.env.INSTAGRAM_INTERNAL_API_KEY,
      "/api/internal/marketing/health",
    ),
    checkInternalHealth(
      process.env.GBP_INTERNAL_API_URL,
      process.env.GBP_INTERNAL_API_KEY,
      "/api/internal/marketing/health",
    ),
  ]);

  return [
    {
      service: "instagram",
      status: instagramStatus === "disconnected" && store.instagramAccountId ? "connected" : instagramStatus,
      lastCheckedAt: checkedAt,
    },
    {
      service: "gbp",
      status: gbpStatus === "disconnected" && store.gbpLocationId ? "connected" : gbpStatus,
      lastCheckedAt: checkedAt,
    },
    {
      service: "canva",
      status: store.canvaBrandId ? "connected" : "disconnected",
      lastCheckedAt: checkedAt,
    },
  ];
}
