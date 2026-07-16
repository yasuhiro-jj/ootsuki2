const MENU_CANDIDATES = [
  '生ビール',
  '中生ビール',
  '刺身定食',
  '唐揚げ',
  '唐揚げ定食',
  '刺身盛り合わせ',
  '海鮮丼',
  'まぐろ丼',
];

export function normalizeMenuName(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '').trim();
}

export function extractExplicitMenuName(message: string): string | null {
  const normalized = normalizeMenuName(message);
  const matched = MENU_CANDIDATES.find((candidate) => normalized.includes(normalizeMenuName(candidate)));
  return matched ?? null;
}

export function isSameMenuName(a: string, b: string): boolean {
  return normalizeMenuName(a) === normalizeMenuName(b);
}
