import type { FarmRecord } from '@/types/chat';

function formatYen(price: number | null): string {
  if (typeof price !== 'number') return '価格未設定';
  return `${price.toLocaleString('ja-JP')}円`;
}

export function buildFarmPriceReply(item: FarmRecord): string {
  let text = `${item.name}は${formatYen(item.price)}です。`;
  if (item.features) text += ` ${item.features}`;
  return text;
}

export function buildFarmStockReply(item: FarmRecord): string {
  if (item.inStock && item.available && item.visible) {
    const count = item.stockCount != null ? ` 在庫数は${item.stockCount}です。` : '';
    return `${item.name}は現在ご案内可能です。${count}`;
  }
  return `${item.name}は現在ご案内状況が変動する可能性があります。`;
}

export function buildFarmSeasonReply(item: FarmRecord): string {
  const season = item.harvestSeason ? `収穫時期は${item.harvestSeason}です。` : '';
  const seasonal = item.seasonal ? '今おすすめの時期です。' : '';
  return `${item.name}について、${season}${seasonal}`.trim();
}

export function buildFarmDetailReply(item: FarmRecord): string {
  const parts = [item.features, item.usage ? `用途は${item.usage}です。` : '', item.storageMethod ? `保存方法は${item.storageMethod}です。` : ''].filter(Boolean);
  if (parts.length > 0) return `${item.name}は、${parts.join(' ')}`;
  return `${item.name}の詳しい特徴は農場データベースで確認中です。`;
}

export function buildFarmRecommendReply(item: FarmRecord): string {
  let text = `今のおすすめは${item.name}です。`;
  if (item.recommendationReason) text += ` ${item.recommendationReason}`;
  else if (item.features) text += ` ${item.features}`;
  if (item.price !== null) text += ` 価格は${formatYen(item.price)}です。`;
  return text;
}
