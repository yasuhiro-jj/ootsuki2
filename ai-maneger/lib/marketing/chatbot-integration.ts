import {
  getPageWithToken,
  getPropertyNameByAliases,
  getPropertyNumber,
  getPropertyText,
  queryDatabaseAllWithToken,
  updatePageWithToken,
} from "@/lib/notion/client";

const NODE_NAME_ALIASES = ["ノード名 1", "ノード名"];
const KEYWORDS_ALIASES = ["キーワード"];
const PRIORITY_ALIASES = ["優先度"];

export type ChatbotNodeSnapshot = {
  priority?: number;
  keywords: string[];
};

export type ChatbotNodeUpdateResult =
  | {
      ok: true;
      pageId: string;
      pageUrl: string;
      nodeName: string;
      before: ChatbotNodeSnapshot;
      after: ChatbotNodeSnapshot;
    }
  | { ok: false; message: string };

function chatbotNotionConfig() {
  return {
    token: (process.env.CHATBOT_NOTION_API_KEY || "").trim(),
    conversationDbId: (process.env.CHATBOT_NOTION_CONVERSATION_DB_ID || "").trim(),
  };
}

export function isChatbotIntegrationConfigured() {
  const { token, conversationDbId } = chatbotNotionConfig();
  return Boolean(token && conversationDbId);
}

function parseKeywords(text: string): string[] {
  return text
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const NODE_SUMMARY_CACHE_TTL_MS = 30 * 60 * 1000;
let nodeSummaryCache: { expiresAt: number; text: string } | null = null;

/**
 * AI施策生成プロンプトに渡す、会話ノードDBの要約（カテゴリ別・優先度の低い順）。
 * 全件は渡さずカテゴリごとに代表ノードだけ抜粋してトークン量を抑える。
 */
export async function getChatbotNodesSummaryForPrompt(): Promise<string> {
  if (nodeSummaryCache && nodeSummaryCache.expiresAt > Date.now()) {
    return nodeSummaryCache.text;
  }

  const { token, conversationDbId } = chatbotNotionConfig();
  if (!token || !conversationDbId) {
    return "（チャットボット連携は未設定のため対象外です）";
  }

  const pages = await queryDatabaseAllWithToken(token, conversationDbId, {}).catch(() => null);
  if (!pages) {
    return "（会話ノードDBの取得に失敗しました）";
  }

  const rows = pages
    .map((page) => ({
      category: getPropertyText(page.properties, ["カテゴリ"]) || "未分類",
      nodeName: getPropertyText(page.properties, NODE_NAME_ALIASES),
      priority: getPropertyNumber(page.properties, PRIORITY_ALIASES) ?? 999,
    }))
    .filter((row) => row.nodeName);

  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCategory.get(row.category) || [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  const lines = Array.from(byCategory.entries()).map(([category, items]) => {
    const sorted = [...items].sort((a, b) => a.priority - b.priority);
    const sample = sorted
      .slice(0, 6)
      .map((item) => `${item.nodeName}(優先度${item.priority})`)
      .join(", ");
    return `- ${category}（全${items.length}件）: ${sample}`;
  });

  const text = lines.length > 0 ? lines.join("\n") : "（会話ノードが見つかりませんでした）";
  nodeSummaryCache = { expiresAt: Date.now() + NODE_SUMMARY_CACHE_TTL_MS, text };
  return text;
}

/** 会話ノードDBから、ノード名にキーワードを含むページを検索する（読み取りのみ、確認用）。 */
export async function findChatbotNodesByName(nodeNameQuery: string) {
  const { token, conversationDbId } = chatbotNotionConfig();
  if (!token || !conversationDbId) return [];

  const query = nodeNameQuery.trim();
  if (!query) return [];

  const pages = await queryDatabaseAllWithToken(token, conversationDbId, {
    filter: {
      or: [
        { property: "ノード名 1", rich_text: { contains: query } },
        { property: "キーワード", rich_text: { contains: query } },
      ],
    },
    page_size: 10,
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("[chatbot-integration] findChatbotNodesByName failed:", error);
    throw error;
  });

  return pages.map((page) => ({
    pageId: page.id,
    pageUrl: page.url || "",
    nodeName: getPropertyText(page.properties, NODE_NAME_ALIASES) || query,
    priority: getPropertyNumber(page.properties, PRIORITY_ALIASES),
    keywords: parseKeywords(getPropertyText(page.properties, KEYWORDS_ALIASES)),
  }));
}

/**
 * 指定した会話ノードの優先度を引き上げ、キーワードを追記する。
 * 対象ページIDは事前に findChatbotNodesByName で確認したものを使う想定（AIが未確認のノードを書き換えない）。
 */
export async function applyChatbotNodeBoost(params: {
  pageId: string;
  addKeywords: string[];
  newPriority: number;
}): Promise<ChatbotNodeUpdateResult> {
  const { token, conversationDbId } = chatbotNotionConfig();
  if (!token || !conversationDbId) {
    return { ok: false, message: "CHATBOT_NOTION_API_KEY / CHATBOT_NOTION_CONVERSATION_DB_ID が未設定です" };
  }

  const page = await getPageWithToken(token, params.pageId).catch(() => null);
  if (!page) {
    return { ok: false, message: "指定された会話ノードが見つかりませんでした" };
  }

  const properties = page.properties;
  const nodeName = getPropertyText(properties, NODE_NAME_ALIASES) || params.pageId;
  const currentPriority = getPropertyNumber(properties, PRIORITY_ALIASES);
  const currentKeywords = parseKeywords(getPropertyText(properties, KEYWORDS_ALIASES));
  const mergedKeywords = Array.from(new Set([...currentKeywords, ...params.addKeywords.map((k) => k.trim()).filter(Boolean)]));

  const priorityPropName = getPropertyNameByAliases(properties, PRIORITY_ALIASES) || "優先度";
  const keywordsPropName = getPropertyNameByAliases(properties, KEYWORDS_ALIASES) || "キーワード";
  const priorityIsNumberType = properties[priorityPropName]?.type === "number";

  const updated = await updatePageWithToken(token, params.pageId, {
    properties: {
      [priorityPropName]: priorityIsNumberType
        ? { number: params.newPriority }
        : { rich_text: [{ text: { content: String(params.newPriority) } }] },
      [keywordsPropName]: { rich_text: [{ text: { content: mergedKeywords.join(",") } }] },
    },
  });

  return {
    ok: true,
    pageId: params.pageId,
    pageUrl: updated.url || page.url || "",
    nodeName,
    before: { priority: currentPriority, keywords: currentKeywords },
    after: { priority: params.newPriority, keywords: mergedKeywords },
  };
}
