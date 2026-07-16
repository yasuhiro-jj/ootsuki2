import { notionQueryDataSource } from '@/lib/notion/notionClient';
import {
  getCheckbox,
  getMultiSelect,
  getNumber,
  getRichText,
  getSelect,
  getTitle,
} from '@/lib/notion/propertyHelpers';
import { isSameFarmName } from '@/lib/farm/farmMatcher';
import type { FarmRecord } from '@/types/chat';

function farmDataSourceId(): string {
  return process.env.NOTION_FARM_DATA_SOURCE_ID?.trim() ?? '';
}

function mapFarmItem(page: any): FarmRecord {
  const props = page.properties ?? {};

  return {
    id: page.id,
    name: getTitle(props, 'Name'),
    price: getNumber(props, 'Price'),
    inStock: getCheckbox(props, '在庫あり'),
    stockCount: getNumber(props, '在庫数'),
    visible: getCheckbox(props, '表示ON/OFF'),
    available: getCheckbox(props, '提供可能'),
    harvestSeason: getSelect(props, '収穫時期') || getRichText(props, '収穫時期'),
    seasonal: getCheckbox(props, '旬'),
    category: getSelect(props, 'カテゴリ'),
    variety: getSelect(props, '品種') || getRichText(props, '品種'),
    features: getRichText(props, '特徴'),
    tasteProfile: getMultiSelect(props, '味の傾向'),
    recommendationReason: getRichText(props, 'おすすめ理由'),
    usage: getRichText(props, '用途'),
    storageMethod: getRichText(props, '保存方法'),
    popularity: getNumber(props, '人気度') ?? 0,
    recommendationPriority: getNumber(props, 'おすすめ優先度') ?? 0,
  };
}

export async function getFarmItemByExactName(name: string): Promise<FarmRecord | null> {
  const data = await notionQueryDataSource(farmDataSourceId(), {
    filter: {
      property: 'Name',
      title: {
        equals: name,
      },
    },
    page_size: 10,
  });

  const items = (data.results ?? []).map(mapFarmItem);
  return items.find((item: FarmRecord) => isSameFarmName(item.name, name)) ?? items[0] ?? null;
}

export async function searchFarmItems(): Promise<FarmRecord[]> {
  const filters: any[] = [
    { property: '表示ON/OFF', checkbox: { equals: true } },
    { property: '提供可能', checkbox: { equals: true } },
  ];

  const data = await notionQueryDataSource(farmDataSourceId(), {
    filter: { and: filters },
    page_size: 50,
  });

  return (data.results ?? []).map(mapFarmItem);
}

export async function getRecommendedFarmItems(): Promise<FarmRecord[]> {
  return searchFarmItems();
}
