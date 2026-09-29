import { classifyTechTopic } from "./categories";
import { parseFeedXml } from "./rss";
import { MEDIA_SOURCES } from "./sources";
import { articleId, mergeArticles, readTechNewsStore, toSnapshot, writeTechNewsStore } from "./store";
import { buildDigestCopy } from "./text";
import type { TechArticle, TechNewsSnapshot } from "./types";

const FETCH_TIMEOUT_MS = 8000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PER_CATEGORY = 8;

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      "user-agent": "ai-maneger-tech-news/1.0",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.text();
}

export async function collectMediaArticles(now = new Date()): Promise<TechNewsSnapshot> {
  const errors: string[] = [];
  const incoming: TechArticle[] = [];
  const ingestedAt = now.toISOString();
  const oldest = now.getTime() - MAX_AGE_MS;

  await Promise.all(
    MEDIA_SOURCES.map(async (source) => {
      try {
        const xml = await fetchText(source.url);
        const items = parseFeedXml(xml).slice(0, 20);
        for (const item of items) {
          const publishedAt = item.publishedAt || ingestedAt;
          if (Date.parse(publishedAt) < oldest) continue;
          const category = classifyTechTopic(`${item.title} ${item.excerpt}`, source.hint);
          if (!category) continue;
          const copy = buildDigestCopy({
            title: item.title,
            excerpt: item.excerpt,
            sourceName: source.name,
            category,
          });
          incoming.push({
            id: articleId(item.link),
            title: item.title.slice(0, 180),
            summary: copy.summary,
            whyItMatters: copy.whyItMatters,
            category,
            sourceKind: "media",
            sourceName: source.name,
            url: item.link,
            publishedAt,
            ingestedAt,
            origin: "rss",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "取得失敗";
        errors.push(`${source.name}: ${message}`);
      }
    }),
  );

  const capped = capByCategory(incoming);
  const store = await readTechNewsStore();
  const mediaKept = store.articles.filter((article) => article.sourceKind !== "media");
  store.articles = mergeArticles(mediaKept, capped);
  store.lastMediaSyncAt = ingestedAt;
  store.mediaErrors = errors.slice(0, 8);
  await writeTechNewsStore(store);
  return toSnapshot(store);
}

function capByCategory(articles: TechArticle[]) {
  const counts = new Map<string, number>();
  const kept: TechArticle[] = [];
  const sorted = [...articles].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  for (const article of sorted) {
    const used = counts.get(article.category) ?? 0;
    if (used >= PER_CATEGORY) continue;
    counts.set(article.category, used + 1);
    kept.push(article);
  }
  return kept;
}

const STALE_MS = 6 * 60 * 60 * 1000;

export async function loadTechNews(options?: { refreshIfStale?: boolean }) {
  const store = await readTechNewsStore();
  const synced = store.lastMediaSyncAt ? Date.parse(store.lastMediaSyncAt) : 0;
  const stale = !synced || Date.now() - synced > STALE_MS;
  if (options?.refreshIfStale && stale) {
    try {
      return await collectMediaArticles();
    } catch (error) {
      const message = error instanceof Error ? error.message : "メディア取得に失敗しました";
      return toSnapshot({ ...store, mediaErrors: [message, ...store.mediaErrors].slice(0, 8) });
    }
  }
  return toSnapshot(store);
}
