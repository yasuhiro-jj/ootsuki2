import type { ChatDomain } from '@/types/chat';

const FARM_KEYWORDS = [
  '野菜',
  '果物',
  '農場',
  '収穫',
  '旬',
  'トマト',
  'ナス',
  'なす',
  'きゅうり',
  'いちご',
  'とうもろこし',
  '在庫',
  '出荷',
  '今採れる',
  'おすすめ野菜',
];

const MENU_KEYWORDS = [
  'メニュー',
  '定食',
  'ビール',
  '刺身',
  '唐揚げ',
  'ランチ',
  'つまみ',
  '注文',
];

export function detectChatDomain(message: string): ChatDomain {
  if (FARM_KEYWORDS.some((keyword) => message.includes(keyword))) return 'farm';
  if (MENU_KEYWORDS.some((keyword) => message.includes(keyword))) return 'menu';
  return 'unknown';
}
