import { WHY_IT_MATTERS } from "./categories";
import type { TechCategory } from "./types";

export function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

export function stripHtml(value: string) {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function hasJapanese(value: string) {
  return (value.match(/[\u3040-\u30ff\u4e00-\u9faf]/g) || []).length >= 8;
}

export function buildDigestCopy(input: {
  title: string;
  excerpt: string;
  sourceName: string;
  category: TechCategory;
}) {
  const excerpt = stripHtml(input.excerpt);
  const whyItMatters = WHY_IT_MATTERS[input.category];
  if (hasJapanese(excerpt) || hasJapanese(input.title)) {
    const body = excerpt || input.title;
    return { summary: clip(body, 180), whyItMatters };
  }
  const lead = `${input.sourceName}より。「${clip(input.title, 80)}」。要点だけ把握し、必要なら元記事を開く。`;
  const original = excerpt ? `原文: ${clip(excerpt, 120)}` : "";
  return {
    summary: clip(original ? `${lead} ${original}` : lead, 280),
    whyItMatters,
  };
}
