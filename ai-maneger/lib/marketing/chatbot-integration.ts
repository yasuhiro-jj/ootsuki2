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
