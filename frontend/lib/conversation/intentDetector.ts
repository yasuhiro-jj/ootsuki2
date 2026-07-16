import { extractExplicitMenuName } from '@/lib/menu/menuMatcher';
import type { ChatIntent, ParsedRequest } from '@/types/chat';

function detectIntent(message: string): ChatIntent {
  if (/値段|いくら|価格/.test(message)) return 'price_check';
  if (/ください|お願いします|注文|それで|ちょうだい|頂戴/.test(message)) return 'order';
  if (/おすすめ|オススメ|人気|なにがいい|何がいい|旬|今採れる|おすすめ野菜/.test(message)) return 'recommend';
  if (/今ある|今ありますか|ありますか|出せますか|提供|在庫/.test(message)) return 'availability_check';
  if (/何が入って|なにが入って|セット内容|詳しく|説明|理由|おすすめ理由/.test(message)) {
    return 'detail_followup';
  }
  if (/ある？|ありますか|どんな/.test(message)) return 'menu_info';
  return 'unknown';
}

function extractQuantity(message: string): number {
  const kanjiMap: Record<string, number> = {
    一つ: 1,
    二つ: 2,
    三つ: 3,
    ひとつ: 1,
    ふたつ: 2,
    みっつ: 3,
  };

  for (const [key, value] of Object.entries(kanjiMap)) {
    if (message.includes(key)) return value;
  }

  const match = message.match(/(\d+)\s*(つ|個|杯|本)?/);
  if (match?.[1]) return Number(match[1]);

  return 1;
}

function getTimeContext(now = new Date()): 'lunch' | 'dinner' | 'anytime' {
  const hour = now.getHours();
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 23) return 'dinner';
  return 'anytime';
}

function detectDrinkContext(message: string): string | null {
  if (/生ビール|ビール/.test(message)) return 'ビール';
  if (/日本酒/.test(message)) return '日本酒';
  if (/ハイボール/.test(message)) return 'ハイボール';
  if (/焼酎/.test(message)) return '焼酎';
  return null;
}

function detectPreferenceTags(message: string): string[] {
  const tags: string[] = [];
  if (/海鮮|刺身|魚/.test(message)) tags.push('海鮮系');
  if (/肉/.test(message)) tags.push('肉料理');
  if (/辛い|ピリ辛|激辛/.test(message)) tags.push('辛い');
  if (/さっぱり/.test(message)) tags.push('さっぱり');
  if (/こってり/.test(message)) tags.push('こってり');
  if (/ボリューム/.test(message)) tags.push('ボリューム');
  return tags;
}

export function parseUserMessage(message: string): ParsedRequest {
  return {
    intent: detectIntent(message),
    message,
    explicitMenuName: extractExplicitMenuName(message),
    quantity: extractQuantity(message),
    hasPronounReference: /それ|あれ|そのやつ|さっきの/.test(message),
    hasRecommendedReference: /さっきのおすすめ|おすすめのやつ|そのおすすめ/.test(message),
    asksPrice: /値段|いくら|価格/.test(message),
    asksDetail: /何が入って|なにが入って|セット内容|詳しく|説明|理由|おすすめ理由/.test(message),
    asksAvailability: /今ある|今ありますか|ありますか|出せますか|提供|在庫/.test(message),
    timeContext: getTimeContext(),
    drinkContext: detectDrinkContext(message),
    preferenceTags: detectPreferenceTags(message),
  };
}
