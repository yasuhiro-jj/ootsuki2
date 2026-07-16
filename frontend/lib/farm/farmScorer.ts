import type { FarmRecord, ParsedRequest } from '@/types/chat';

export function scoreFarmItem(item: FarmRecord, parsed: ParsedRequest): number {
  let score = 0;

  if (item.visible) score += 5;
  if (item.available) score += 5;
  if (item.inStock) score += 8;
  if (item.seasonal) score += 15;
  score += item.recommendationPriority * 4;
  score += Math.floor(item.popularity / 10);

  for (const pref of parsed.preferenceTags) {
    if (item.tasteProfile.includes(pref)) score += 10;
    if (pref === 'さっぱり' && item.tasteProfile.some((tag) => tag.includes('さっぱり'))) score += 8;
  }

  return score;
}
