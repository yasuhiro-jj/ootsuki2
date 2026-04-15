import { blockToMinimal, getBlockChildren } from "@/lib/notion/client";

export async function getPageExcerpt(pageId: string) {
  if (!pageId) return [];
  const blocks = await getBlockChildren(pageId);
  return blocks
    .map(blockToMinimal)
    .filter((block): block is NonNullable<typeof block> => Boolean(block))
    .slice(0, 10);
}
