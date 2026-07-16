import type { MenuRecord, ParsedRequest } from '@/types/chat';

export function scoreMenu(menu: MenuRecord, parsed: ParsedRequest): number {
  let score = 0;

  if (menu.visible) score += 5;
  if (menu.available) score += 5;
  if (menu.inStock) score += 3;

  score += menu.recommendationPriority * 4;
  score += Math.floor(menu.popularity / 10);

  if (parsed.timeContext === 'lunch') {
    if (menu.lunchRecommended) score += 20;
    if (menu.timeBand === 'ランチ') score += 12;
  }

  if (parsed.timeContext === 'dinner') {
    if (menu.dinnerRecommended) score += 20;
    if (menu.timeBand === 'ディナー') score += 12;
  }

  if (parsed.drinkContext) {
    if (menu.alcoholPairing) score += 15;
    if (menu.recommendedAlcohols.includes(parsed.drinkContext)) score += 15;
  }

  for (const pref of parsed.preferenceTags) {
    if (menu.customerPreferences.includes(pref)) score += 12;
    if (menu.tags.includes(pref)) score += 8;
    if (pref === '海鮮系' && menu.likesSeafood) score += 10;
    if (pref === '肉料理' && menu.likesMeat) score += 10;
    if (pref === '辛い' && menu.likesSpicy) score += 10;
    if (pref === 'さっぱり' && (menu.customerPreferences.includes('さっぱり') || menu.tags.includes('さっぱり'))) {
      score += 10;
    }
  }

  return score;
}
