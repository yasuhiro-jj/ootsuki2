import {
  getBlockChildren,
  getPage,
  getPropertyText,
  propertyToText,
  queryDatabaseAll,
} from "@/lib/notion/client";
import type { NotionPage } from "@/types/notion";

const TITLE_KEYS = ["タイトル", "件名", "名前", "Name", "title"];
const SUMMARY_KEYS = ["要点", "要約", "Summary", "概要", "内容", "本文"];

function read(value?: string | null) {
  return value?.trim() || "";
}

function parseKnowledgeUrls(raw: string) {
  return raw
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildKnowledgeContextLabel(label: string) {
  return `【${label}】`;
}

function extractNotionIdFromUrl(url: string) {
  const matched = url.match(/([0-9a-fA-F]{32})(?=(?:\?|$|[#/]))/);
  if (!matched) return "";
  const compact = matched[1].toLowerCase();
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function summarizePage(page: NotionPage) {
  const title = getPropertyText(page.properties, TITLE_KEYS) || "名称未設定";
  const summary = getPropertyText(page.properties, SUMMARY_KEYS);
  const details = Object.entries(page.properties)
    .map(([key, value]) => {
      const text = propertyToText(value);
      if (!text || key === "title" || TITLE_KEYS.includes(key) || SUMMARY_KEYS.includes(key)) return null;
      return `${key}: ${text}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 4);

  return [`- ${title}`, ...(summary ? [`  要約: ${summary}`] : []), ...details.map((item) => `  ${item}`)].join("\n");
}

async function summarizeDatabase(url: string, databaseId: string) {
  const pages = await queryDatabaseAll(databaseId, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  if (pages.length === 0) {
    return `参照元: ${url}\n- レコードはまだありません。`;
  }

  return [
    `参照元: ${url}`,
    ...pages.slice(0, 8).map((page) => summarizePage(page)),
  ].join("\n");
}

async function summarizePageBlocks(url: string, pageId: string) {
  const page = await getPage(pageId);
  const blocks = await getBlockChildren(pageId);
  const textLines = blocks
    .map((block) =>
      block.paragraph?.rich_text?.map((item) => item.plain_text).join("") ||
      block.heading_1?.rich_text?.map((item) => item.plain_text).join("") ||
      block.heading_2?.rich_text?.map((item) => item.plain_text).join("") ||
      block.heading_3?.rich_text?.map((item) => item.plain_text).join("") ||
      block.bulleted_list_item?.rich_text?.map((item) => item.plain_text).join(""),
    )
    .map((entry) => read(entry))
    .filter(Boolean)
    .slice(0, 12);

  const title = getPropertyText(page.properties, TITLE_KEYS) || "参照ページ";
  return [
    `参照元: ${url}`,
    `- ${title}`,
    ...textLines.map((line) => `  ${line}`),
  ].join("\n");
}

export async function getKnowledgeContextFromUrls(label: string, rawUrls: string) {
  const urls = parseKnowledgeUrls(rawUrls);
  if (urls.length === 0) return "";

  const sections = await Promise.all(
    urls.map(async (url) => {
      const notionId = extractNotionIdFromUrl(url);
      if (!notionId) {
        return `参照元: ${url}\n- URL から Notion ID を抽出できませんでした。`;
      }

      try {
        return await summarizeDatabase(url, notionId);
      } catch {
        try {
          return await summarizePageBlocks(url, notionId);
        } catch (error) {
          return `参照元: ${url}\n- 取得に失敗: ${error instanceof Error ? error.message : "不明なエラー"}`;
        }
      }
    }),
  );

  return [buildKnowledgeContextLabel(label), ...sections].join("\n\n");
}

export async function getRestaurantConsultingKnowledgeContext() {
  return getKnowledgeContextFromUrls(
    "飲食コンサル参照ナレッジ",
    read(process.env.NOTION_OOTSUKI_RESTAURANT_CONSULT_URLS),
  );
}

export async function getAgentHubKnowledgeContext() {
  return getKnowledgeContextFromUrls(
    "エージェント呼び出しハブ参照ナレッジ",
    read(process.env.NOTION_OOTSUKI_AGENT_HUB_KNOWLEDGE_URLS),
  );
}
