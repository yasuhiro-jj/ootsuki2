import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { TECH_CATEGORIES, type TechArticle, type TechNewsSnapshot, type TechNewsStore } from "./types";

const MAX_ARTICLES = 160;
const MAX_PER_KIND = 100;

function emptyStore(): TechNewsStore {
  return {
    version: 1,
    articles: [],
    lastMediaSyncAt: null,
    lastXSyncAt: null,
    mediaErrors: [],
  };
}

export function techNewsStorePath() {
  return process.env.TECH_NEWS_STORE_PATH?.trim() || path.join(process.cwd(), "data", "tech-news-store.json");
}

export function articleId(url: string) {
  return createHash("sha256").update(url.trim()).digest("hex").slice(0, 16);
}

export async function readTechNewsStore(): Promise<TechNewsStore> {
  try {
    const raw = await readFile(techNewsStorePath(), "utf8");
    const parsed = JSON.parse(raw) as TechNewsStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.articles)) return emptyStore();
    return {
      version: 1,
      articles: parsed.articles,
      lastMediaSyncAt: parsed.lastMediaSyncAt ?? null,
      lastXSyncAt: parsed.lastXSyncAt ?? null,
      mediaErrors: Array.isArray(parsed.mediaErrors) ? parsed.mediaErrors.slice(0, 8) : [],
    };
  } catch {
    return emptyStore();
  }
}

export async function writeTechNewsStore(store: TechNewsStore) {
  const file = techNewsStorePath();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(store), "utf8");
  await rename(temp, file);
}

export function mergeArticles(existing: TechArticle[], incoming: TechArticle[]) {
  const byId = new Map<string, TechArticle>();
  for (const article of [...incoming, ...existing]) {
    const current = byId.get(article.id);
    if (!current || article.ingestedAt >= current.ingestedAt) byId.set(article.id, article);
  }
  const merged = [...byId.values()].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const kept: TechArticle[] = [];
  const counts = { media: 0, x: 0 };
  for (const article of merged) {
    if (counts[article.sourceKind] >= MAX_PER_KIND) continue;
    counts[article.sourceKind] += 1;
    kept.push(article);
    if (kept.length >= MAX_ARTICLES) break;
  }
  return kept;
}

export function toSnapshot(store: TechNewsStore): TechNewsSnapshot {
  const counts = Object.fromEntries(TECH_CATEGORIES.map((category) => [category, 0])) as TechNewsSnapshot["counts"];
  let mediaCount = 0;
  let xCount = 0;
  for (const article of store.articles) {
    counts[article.category] += 1;
    if (article.sourceKind === "x") xCount += 1;
    else mediaCount += 1;
  }
  return { ...store, counts, mediaCount, xCount, notionUrl: null };
}
