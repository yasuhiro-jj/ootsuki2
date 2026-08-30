import type {
  MarketingAction,
  MarketingActionDestination,
  MarketingChannelMetrics,
  MarketingStore,
} from "@/types/marketing";

function readPublicEnv(name: string, fallback: string) {
  const values: Record<string, string | undefined> = {
    NEXT_PUBLIC_CANVA_APP_URL: process.env.NEXT_PUBLIC_CANVA_APP_URL,
    NEXT_PUBLIC_INSTAGRAM_APP_URL: process.env.NEXT_PUBLIC_INSTAGRAM_APP_URL,
    NEXT_PUBLIC_GBP_APP_URL: process.env.NEXT_PUBLIC_GBP_APP_URL,
  };
  return values[name]?.trim() || fallback;
}

function withQuery(url: string, params: Record<string, string>) {
  try {
    const parsed = new URL(url, "http://localhost");
    for (const [key, value] of Object.entries(params)) {
      if (value) parsed.searchParams.set(key, value);
    }
    if (url.startsWith("/")) return `${parsed.pathname}${parsed.search}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

function actionParams(action: MarketingAction, store: MarketingStore) {
  return {
    storeId: store.id,
    storeName: store.name,
    theme: action.contentTheme,
    title: action.title,
    channel: action.targetChannel,
  };
}

export function createCanvaDesign(action: MarketingAction, store: MarketingStore): MarketingActionDestination {
  return {
    key: "canva",
    label: "Canvaで制作",
    href: withQuery(store.canvaAppUrl || readPublicEnv("NEXT_PUBLIC_CANVA_APP_URL", "/canva"), actionParams(action, store)),
    mode: "external_app_redirect",
  };
}

export function createInstagramPost(action: MarketingAction, store: MarketingStore): MarketingActionDestination {
  return {
    key: "instagram",
    label: "Instagram投稿",
    href: withQuery(
      store.instagramAppUrl || readPublicEnv("NEXT_PUBLIC_INSTAGRAM_APP_URL", "/instagram"),
      actionParams(action, store),
    ),
    mode: "external_app_redirect",
  };
}

export function createGBPPost(action: MarketingAction, store: MarketingStore): MarketingActionDestination {
  return {
    key: "gbp",
    label: "Google投稿",
    href: withQuery(
      store.gbpAppUrl || readPublicEnv("NEXT_PUBLIC_GBP_APP_URL", "/google-business-profile"),
      actionParams(action, store),
    ),
    mode: "external_app_redirect",
  };
}

export function scheduleInstagramPost(action: MarketingAction, store: MarketingStore): MarketingActionDestination {
  return createInstagramPost(action, store);
}

export function scheduleGBPPost(action: MarketingAction, store: MarketingStore): MarketingActionDestination {
  return createGBPPost(action, store);
}

export async function getInstagramMetrics(snapshot: MarketingChannelMetrics[]) {
  return snapshot.find((item) => item.channel === "instagram") || null;
}

export async function getGBPMetrics(snapshot: MarketingChannelMetrics[]) {
  return snapshot.find((item) => item.channel === "gbp") || null;
}

export function evaluateMarketingAction(action: MarketingAction) {
  return {
    actionId: action.id,
    status: action.status,
    targetKpi: action.targetKpi,
  };
}

export function getMarketingActionDestinations(
  action: MarketingAction,
  store: MarketingStore,
): MarketingActionDestination[] {
  if (action.targetChannel === "chatbot") return [];
  const destinations = [createCanvaDesign(action, store)];
  if (action.targetChannel === "instagram" || action.targetChannel === "multi") {
    destinations.push(createInstagramPost(action, store));
  }
  if (action.targetChannel === "gbp" || action.targetChannel === "multi") {
    destinations.push(createGBPPost(action, store));
  }
  if (action.targetChannel === "canva") {
    destinations.push(createInstagramPost(action, store), createGBPPost(action, store));
  }
  return destinations;
}
