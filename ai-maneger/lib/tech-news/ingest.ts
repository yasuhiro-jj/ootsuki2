import { WHY_IT_MATTERS } from "./categories";
import { articleId, mergeArticles, readTechNewsStore, writeTechNewsStore } from "./store";
import { clip } from "./text";
import { TECH_CATEGORIES, type IngestArticleInput, type TechArticle, type TechCategory } from "./types";

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

function asCategory(value: unknown): TechCategory {
  if (typeof value === "string" && (TECH_CATEGORIES as readonly string[]).includes(value)) {
    return value as TechCategory;
  }
  throw new IngestError("category は ai / frontend / backend / career / gadget のいずれかです。");
}

function asHttpUrl(value: unknown) {
  if (typeof value !== "string") throw new IngestError("url が必要です。");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new IngestError("url が不正です。");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IngestError("url は http または https だけ受け付けます。");
  }
  return url.toString();
}

function asText(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim()) throw new IngestError(`${field} が必要です。`);
  return clip(value, max);
}

function asDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return new Date().toISOString();
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new IngestError("publishedAt が不正です。");
  return new Date(time).toISOString();
}

export function normalizeIngestArticle(input: IngestArticleInput, ingestedAt: string): TechArticle {
  const category = asCategory(input.category);
  const url = asHttpUrl(input.url);
  return {
    id: articleId(url),
    title: asText(input.title, "title", 120),
    summary: asText(input.summary, "summary", 600),
    whyItMatters: input.whyItMatters?.trim()
      ? asText(input.whyItMatters, "whyItMatters", 200)
      : WHY_IT_MATTERS[category],
    category,
    sourceKind: "x",
    sourceName: input.sourceName?.trim() ? asText(input.sourceName, "sourceName", 80) : "X",
    url,
    publishedAt: asDate(input.publishedAt),
    ingestedAt,
    origin: "grok_bot",
  };
}

export async function ingestXArticles(articles: IngestArticleInput[]) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new IngestError("articles に1件以上必要です。");
  }
  if (articles.length > 20) throw new IngestError("1回の取り込みは20件までです。");
  const ingestedAt = new Date().toISOString();
  const normalized = articles.map((article) => normalizeIngestArticle(article, ingestedAt));
  const store = await readTechNewsStore();
  store.articles = mergeArticles(store.articles, normalized);
  store.lastXSyncAt = ingestedAt;
  await writeTechNewsStore(store);
  return { saved: normalized.length, lastXSyncAt: ingestedAt };
}
