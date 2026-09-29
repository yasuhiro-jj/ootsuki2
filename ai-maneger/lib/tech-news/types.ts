export const TECH_CATEGORIES = ["ai", "frontend", "backend", "career", "gadget"] as const;

export type TechCategory = (typeof TECH_CATEGORIES)[number];

export type TechSourceKind = "media" | "x";

export type TechArticleOrigin = "rss" | "grok_bot";

export interface TechArticle {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  category: TechCategory;
  sourceKind: TechSourceKind;
  sourceName: string;
  url: string;
  publishedAt: string;
  ingestedAt: string;
  origin: TechArticleOrigin;
}

export interface TechNewsStore {
  version: 1;
  articles: TechArticle[];
  lastMediaSyncAt: string | null;
  lastXSyncAt: string | null;
  mediaErrors: string[];
}

export interface TechNewsSnapshot extends TechNewsStore {
  mediaCount: number;
  xCount: number;
  counts: Record<TechCategory, number>;
  notionUrl: string | null;
}

export interface IngestArticleInput {
  title: string;
  summary: string;
  whyItMatters?: string;
  category: TechCategory;
  sourceName?: string;
  url: string;
  publishedAt?: string;
}
