const FARM_ITEM_CANDIDATES = [
  'トマト',
  'きゅうり',
  'キュウリ',
  'ナス',
  'なす',
  'とうもろこし',
  'いちご',
  'ほうれん草',
];

export function normalizeFarmName(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '').trim();
}

export function extractFarmItemName(message: string): string | null {
  const normalized = normalizeFarmName(message);
  return FARM_ITEM_CANDIDATES.find((candidate) => normalized.includes(normalizeFarmName(candidate))) ?? null;
}

export function isSameFarmName(a: string, b: string): boolean {
  return normalizeFarmName(a) === normalizeFarmName(b);
}
