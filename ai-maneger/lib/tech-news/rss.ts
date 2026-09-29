import { decodeXml, stripHtml } from "./text";

export interface FeedItem {
  title: string;
  link: string;
  excerpt: string;
  publishedAt: string | null;
}

function tagText(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function atomLink(block: string) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  for (const link of links) {
    const attrs = link[1] || "";
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1];
    if (rel && rel !== "alternate") continue;
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href) return decodeXml(href).trim();
  }
  return "";
}

function parseDate(value: string) {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function blocks(xml: string, tag: "item" | "entry") {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((match) => match[1]);
}

export function parseFeedXml(xml: string): FeedItem[] {
  const itemBlocks = blocks(xml, "item");
  if (itemBlocks.length > 0) {
    return itemBlocks
      .map((block) => ({
        title: tagText(block, "title"),
        link: tagText(block, "link") || atomLink(block),
        excerpt: tagText(block, "description") || tagText(block, "content:encoded") || tagText(block, "summary"),
        publishedAt: parseDate(tagText(block, "pubDate") || tagText(block, "dc:date") || tagText(block, "updated")),
      }))
      .filter((item) => item.title && item.link);
  }

  return blocks(xml, "entry")
    .map((block) => ({
      title: tagText(block, "title"),
      link: atomLink(block) || tagText(block, "link"),
      excerpt: tagText(block, "summary") || tagText(block, "content"),
      publishedAt: parseDate(tagText(block, "updated") || tagText(block, "published")),
    }))
    .filter((item) => item.title && item.link);
}
