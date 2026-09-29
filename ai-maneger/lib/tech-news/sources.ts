import type { TechCategory } from "./types";

export interface MediaSource {
  name: string;
  url: string;
  hint: TechCategory | null;
}

/** 公式ブログとテックメディア。X はここには含めず、Grok Bot の ingest が担当する。 */
export const MEDIA_SOURCES: MediaSource[] = [
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", hint: "ai" },
  { name: "GitHub Blog", url: "https://github.blog/feed/", hint: null },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", hint: null },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", hint: null },
  { name: "Engadget", url: "https://www.engadget.com/rss.xml", hint: "gadget" },
  { name: "Zenn", url: "https://zenn.dev/feed", hint: null },
  { name: "はてなブックマーク IT", url: "https://b.hatena.ne.jp/hotentry/it.rss", hint: null },
  { name: "GIGAZINE", url: "https://gigazine.net/news/rss_atom/", hint: null },
];
