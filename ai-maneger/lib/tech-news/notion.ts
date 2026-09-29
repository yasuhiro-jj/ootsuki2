import { WHY_IT_MATTERS } from "./categories";
import { TECH_NEWS_DATABASE_ID, TECH_NEWS_DATA_SOURCE_ID, TECH_NEWS_NOTION_URL } from "./notion-ids";
import { toSnapshot } from "./store";
import { clip } from "./text";
import { TECH_CATEGORIES, type TechArticle, type TechCategory, type TechNewsSnapshot } from "./types";
import { getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import type { NotionPage } from "@/types/notion";

export { TECH_NEWS_DATABASE_ID, TECH_NEWS_DATA_SOURCE_ID, TECH_NEWS_NOTION_URL };

const MISSING_TOKEN_MESSAGE =
  "Notion の読み取りトークンが未設定です。AI Manager のインテグレーションを「テックニュース」データベースに接続し、NOTION_API_KEY（または NOTION_TECH_NEWS_API_KEY）を設定してください。";

export function techNewsDatabaseId() {
  return process.env.NOTION_TECH_NEWS_DATABASE_ID?.trim() || TECH_NEWS_DATABASE_ID;
}

export function techNewsDataSourceId() {
  return process.env.NOTION_TECH_NEWS_DATA_SOURCE_ID?.trim() || TECH_NEWS_DATA_SOURCE_ID;
}

export function resolveTechNewsNotionToken() {
  return (
    process.env.NOTION_TECH_NEWS_API_KEY?.trim() ||
    process.env.NOTION_API_KEY?.trim() ||
    process.env.NOTION_API_TOKEN?.trim() ||
    ""
  );
}

export function toIsoTimestamp(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const time = Date.parse(normalized);
  if (Number.isNaN(time)) return "";
  return new Date(time).toISOString();
}

function latest(values: string[]) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

export function notionPageToArticle(page: NotionPage): TechArticle | null {
  const properties = page.properties ?? {};
  const title = getPropertyText(properties, ["見出し"]);
  const url = getPropertyText(properties, ["URL"]);
  const categoryName = getPropertyText(properties, ["カテゴリ"]).toLowerCase();
  const lane = getPropertyText(properties, ["欄"]);
  if (!title || !url) return null;
  if (!(TECH_CATEGORIES as readonly string[]).includes(categoryName)) return null;
  const sourceKind = lane === "X" ? "x" : lane === "RSS" ? "media" : null;
  if (!sourceKind) return null;

  const category = categoryName as TechCategory;
  const publishedAt = toIsoTimestamp(getPropertyText(properties, ["投稿日時"])) || toIsoTimestamp(page.created_time || "");
  if (!publishedAt) return null;
  const ingestedAt = toIsoTimestamp(page.created_time || "") || publishedAt;
  const why = getPropertyText(properties, ["概要だけでよい理由"]);

  return {
    id: page.id,
    title: clip(title, 120),
    summary: clip(getPropertyText(properties, ["要約"]), 600),
    whyItMatters: clip(why || WHY_IT_MATTERS[category], 200),
    category,
    sourceKind,
    sourceName: clip(getPropertyText(properties, ["ソース"]) || (sourceKind === "x" ? "X" : "RSS"), 80),
    url,
    publishedAt,
    ingestedAt,
    origin: sourceKind === "x" ? "grok_bot" : "rss",
  };
}

export function snapshotFromNotionPages(pages: NotionPage[], errors: string[] = []): TechNewsSnapshot {
  const articles = pages
    .map(notionPageToArticle)
    .filter((article): article is TechArticle => Boolean(article))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const snapshot = toSnapshot({
    version: 1,
    articles,
    lastMediaSyncAt: latest(articles.filter((article) => article.sourceKind === "media").map((article) => article.ingestedAt)),
    lastXSyncAt: latest(articles.filter((article) => article.sourceKind === "x").map((article) => article.ingestedAt)),
    mediaErrors: errors,
  });
  return { ...snapshot, notionUrl: TECH_NEWS_NOTION_URL };
}

export async function loadTechNewsFromNotion(): Promise<TechNewsSnapshot> {
  const token = resolveTechNewsNotionToken();
  if (!token) return snapshotFromNotionPages([], [MISSING_TOKEN_MESSAGE]);

  const query = {
    sorts: [{ property: "投稿日時", direction: "descending" }],
  };
  try {
    const databaseId = techNewsDatabaseId();
    const dataSourceId = techNewsDataSourceId();
    try {
      return snapshotFromNotionPages(await queryDatabaseAllWithToken(token, databaseId, query));
    } catch (databaseError) {
      if (dataSourceId === databaseId) throw databaseError;
      return snapshotFromNotionPages(await queryDatabaseAllWithToken(token, dataSourceId, query));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notion の読み取りに失敗しました";
    const hint = message.includes("Could not find") || message.includes("data sources")
      ? "「テックニュース」データベースを、このトークンの Notion インテグレーションに接続してください。"
      : "";
    return snapshotFromNotionPages([], [hint ? `${message} ${hint}` : message]);
  }
}
