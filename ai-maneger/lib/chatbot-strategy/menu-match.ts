import {
  getPropertyCheckbox,
  getPropertyText,
  queryDatabaseAllWithToken,
} from "@/lib/notion/client";

const NAME_ALIASES = ["Name", "名前", "商品名"];
const ONE_LINER_ALIASES = ["一言紹介"];
const RECOMMENDATION_ALIASES = ["おすすめ理由"];
const IN_STOCK_ALIASES = ["在庫あり"];
const SERVABLE_ALIASES = ["提供可能"];
const DISPLAY_ALIASES = ["表示ON/OFF"];

export type MenuEntry = {
  pageId: string;
  name: string;
  /** 在庫あり・提供可能・表示ON/OFF がすべて true か */
  recommendable: boolean;
  oneLiner: string;
  recommendation: string;
};

/**
 * 商品名の照合キー。ABC分析DB（レジ由来）とメニューDBで表記ゆれがあるため、
 * NFKC 正規化したうえで空白・記号を落として比較する。
 */
export function normalizeProductName(value: string): string {
  return (value || "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[・･,，、.。/／\-−ー―()（）「」【】"'`]/g, "")
    .toLowerCase();
}

export function chatbotMenuConfig() {
  return {
    token: (process.env.CHATBOT_NOTION_API_KEY || "").trim(),
    menuDbId: (process.env.CHATBOT_NOTION_MENU_DB_ID || "").trim(),
  };
}

export function isChatbotMenuConfigured(): boolean {
  const { token, menuDbId } = chatbotMenuConfig();
  return Boolean(token && menuDbId);
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { expiresAt: number; entries: MenuEntry[] } | null = null;

/** チャットボットのメニューDBを取得する（10分キャッシュ）。 */
export async function getMenuEntries(options?: { force?: boolean }): Promise<MenuEntry[]> {
  const { token, menuDbId } = chatbotMenuConfig();
  if (!token || !menuDbId) {
    throw new Error(
      "CHATBOT_NOTION_API_KEY / CHATBOT_NOTION_MENU_DB_ID が未設定です",
    );
  }

  if (!options?.force && cache && cache.expiresAt > Date.now()) {
    return cache.entries;
  }

  const pages = await queryDatabaseAllWithToken(token, menuDbId, {});
  const entries: MenuEntry[] = [];
  for (const page of pages) {
    const name = getPropertyText(page.properties, NAME_ALIASES);
    if (!name) continue;
    // プロパティが無い場合は true 扱い（チャットボット側 _get_checkbox の既定と揃える）。
    const inStock = getPropertyCheckbox(page.properties, IN_STOCK_ALIASES) ?? true;
    const servable = getPropertyCheckbox(page.properties, SERVABLE_ALIASES) ?? true;
    const displayed = getPropertyCheckbox(page.properties, DISPLAY_ALIASES) ?? true;
    entries.push({
      pageId: String(page.id || "").replace(/-/g, ""),
      name,
      recommendable: Boolean(inStock && servable && displayed),
      oneLiner: getPropertyText(page.properties, ONE_LINER_ALIASES),
      recommendation: getPropertyText(page.properties, RECOMMENDATION_ALIASES),
    });
  }

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, entries };
  return entries;
}

export type MenuIndex = Map<string, MenuEntry>;

/** 正規化した商品名 -> メニュー項目。同名が複数ある場合は推薦可能なものを優先する。 */
export function buildMenuIndex(entries: MenuEntry[]): MenuIndex {
  const index: MenuIndex = new Map();
  for (const entry of entries) {
    const key = normalizeProductName(entry.name);
    if (!key) continue;
    const existing = index.get(key);
    if (!existing || (!existing.recommendable && entry.recommendable)) {
      index.set(key, entry);
    }
  }
  return index;
}

/** ABC分析DBの商品名に対応するメニュー項目を完全一致で探す。 */
export function matchMenuEntry(index: MenuIndex, productName: string): MenuEntry | null {
  const key = normalizeProductName(productName);
  if (!key) return null;
  return index.get(key) ?? null;
}
