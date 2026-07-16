import type { ConversationNode, MenuRecord } from '@/types/chat';

function formatYen(price: number | null): string {
  if (typeof price !== 'number') return '価格未設定';
  return `${price.toLocaleString('ja-JP')}円`;
}

function applyTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    result = result.replace(new RegExp(`\\\\?\\{${key}\\\\?\\}`, 'g'), value);
  }
  return result;
}

export function buildPriceReply(menu: MenuRecord): string {
  let text = `${menu.name}は${formatYen(menu.price)}です。`;
  const extra = menu.detail || menu.shortIntro || menu.recommendationReason;
  if (extra) text += ` ${extra}`;
  return text;
}

export function buildOrderReply(menu: MenuRecord, quantity: number): string {
  return `かしこまりました。${menu.name}を${quantity}つですね。`;
}

export function buildDetailReply(menu: MenuRecord): string {
  const parts: string[] = [];

  if (menu.setContents) parts.push(`セット内容は「${menu.setContents}」です。`);
  if (menu.detail) parts.push(menu.detail);
  else if (menu.shortIntro) parts.push(menu.shortIntro);
  if (menu.recommendationReason) parts.push(`おすすめ理由は、${menu.recommendationReason}`);
  if (menu.price !== null) parts.push(`価格は${formatYen(menu.price)}です。`);
  if (!menu.visible || !menu.available) parts.push('提供状況は変動する場合があります。');

  return parts.length > 0 ? parts.join(' ') : `${menu.name}の詳しい内容は店頭でご確認ください。`;
}

export function buildAvailabilityReply(menu: MenuRecord): string {
  if (menu.visible && menu.available && (menu.inStock || !menu.stockStatus || menu.stockStatus === 'あり')) {
    const time = menu.timeBand ? ` 提供時間帯は${menu.timeBand}です。` : '';
    const price = menu.price !== null ? ` 価格は${formatYen(menu.price)}です。` : '';
    return `${menu.name}は現在ご案内可能です。${time}${price}`.trim();
  }

  const stock = menu.stockStatus ? ` 在庫状況は「${menu.stockStatus}」です。` : '';
  return `${menu.name}は現在ご案内状況が変動する可能性があります。${stock}詳しくは店舗へご確認ください。`;
}

export function buildRecommendReply(
  menu: MenuRecord,
  node?: ConversationNode | null,
  trigger?: string | null
): string {
  if (node?.responseTemplate) {
    return applyTemplate(node.responseTemplate, {
      menu_item: menu.name,
      menu_price: formatYen(menu.price),
      menu_desc: menu.shortIntro || menu.detail || menu.recommendationReason,
      recommend_menu: menu.name,
      trigger: trigger ?? 'おすすめ',
    });
  }

  let text = `おすすめでしたら『${menu.name}』はいかがでしょうか。`;
  if (menu.recommendationReason) {
    text += ` ${menu.recommendationReason}`;
  } else if (menu.shortIntro || menu.detail) {
    text += ` ${menu.shortIntro || menu.detail}`;
  }
  if (menu.price !== null) {
    text += ` 価格は${formatYen(menu.price)}です。`;
  }
  return text;
}
