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

export type CanvaStatusPayload = {
  configured?: boolean;
  connected?: boolean;
  expiresAt?: string | null;
  hasRefreshToken?: boolean;
};

/** MEO Auto Assistant の canva-status 応答を、画面表示用の状態へ変換する。
 *
 * リフレッシュトークンがあれば期限切れでも繋ぎ直せるため「接続済み」とみなす。
 */
export function mapCanvaStatus(payload: CanvaStatusPayload, now = Date.now()): IntegrationStatus["status"] {
  if (!payload.configured || !payload.connected) return "disconnected";
  const expiresAt = payload.expiresAt ? Date.parse(payload.expiresAt) : Number.NaN;
  const expired = Number.isFinite(expiresAt) && expiresAt <= now;
  return expired && !payload.hasRefreshToken ? "expired" : "connected";
}

/** MEO Auto Assistant に問い合わせて、店舗単位の Canva 連携状態を取得する。
 *
 * 問い合わせられない場合（未設定・店舗ID不明・エンドポイント未デプロイ）は、
 * 従来どおり canvaBrandId の有無で判定する。MEO 側のデプロイ前に
 * AI Manager だけ先に出ても画面が「エラー」にならないようにするため。
 */
export async function checkCanvaStatus(
  store: MarketingStore,
  options: {
    baseUrl?: string;
    apiKey?: string;
    fetchImpl?: typeof fetch;
    now?: number;
  } = {},
): Promise<IntegrationStatus["status"]> {
  const legacyStatus: IntegrationStatus["status"] = store.canvaBrandId ? "connected" : "disconnected";
  const baseUrl = (options.baseUrl ?? process.env.GBP_INTERNAL_API_URL)?.trim();
  const apiKey = (options.apiKey ?? process.env.GBP_INTERNAL_API_KEY)?.trim();
  const gbpLocationId = store.gbpLocationId?.trim();
  if (!baseUrl || !apiKey || !gbpLocationId) return legacyStatus;

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const url = new URL(
      "api/internal/marketing/canva-status",
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    );
    url.searchParams.set("gbpLocationId", gbpLocationId);
    const response = await fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    // エンドポイント未デプロイ・店舗未登録は「確認できない」だけなので従来判定に戻す。
    if (response.status === 404) return legacyStatus;
    if (!response.ok) return "error";

    const payload = (await response.json()) as CanvaStatusPayload;
    return mapCanvaStatus(payload, options.now);
  } catch {
    return "error";
  }
}

export async function getIntegrationStatuses(store: MarketingStore): Promise<IntegrationStatus[]> {
  const checkedAt = new Date().toISOString();
  const [instagramStatus, gbpStatus, canvaStatus] = await Promise.all([
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
    checkCanvaStatus(store),
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
      status: canvaStatus,
      lastCheckedAt: checkedAt,
    },
  ];
}
