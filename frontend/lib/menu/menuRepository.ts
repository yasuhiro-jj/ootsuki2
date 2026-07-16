import { notionGetPage, notionQueryDataSource } from '@/lib/notion/notionClient';
import {
  getCheckbox,
  getMultiSelect,
  getNumber,
  getRichText,
  getSelect,
  getTitle,
} from '@/lib/notion/propertyHelpers';
import { isSameMenuName } from '@/lib/menu/menuMatcher';
import type { MenuRecord } from '@/types/chat';

function menuDataSourceId(): string {
  return process.env.NOTION_MENU_DATA_SOURCE_ID?.trim() ?? '';
}

function mapMenu(page: any): MenuRecord {
  const props = page.properties ?? {};

  return {
    id: page.id,
    name: getTitle(props, 'Name'),
    price: getNumber(props, 'Price'),
    description: getRichText(props, 'Description'),
    shortIntro: getRichText(props, '一言紹介'),
    detail: getRichText(props, '詳細説明'),
    setContents: getRichText(props, 'セット内容'),
    category: getSelect(props, 'Category'),
    subcategory: getSelect(props, 'Subcategory'),
    foodCategory: getSelect(props, '料理カテゴリ'),
    tags: getMultiSelect(props, 'Tags'),
    tastes: getMultiSelect(props, '味の傾向'),
    recommendationReason: getRichText(props, 'おすすめ理由'),
    recommendationPriority: getNumber(props, 'おすすめ優先度') ?? getNumber(props, 'おすすめ度') ?? 0,
    popularity: getNumber(props, '人気度') ?? getNumber(props, '表示優先度') ?? 0,
    available: getCheckbox(props, '提供可能'),
    visible: getCheckbox(props, '表示ON/OFF'),
    inStock: getCheckbox(props, '在庫あり') || getSelect(props, '在庫状況') === 'あり',
    stockStatus: getSelect(props, '在庫状況'),
    timeBand: getSelect(props, '提供時間帯'),
    lunchRecommended: getCheckbox(props, '今日のランチおすすめ'),
    dinnerRecommended: getCheckbox(props, '今夜のおすすめ'),
    snackRecommended: getCheckbox(props, 'おすすめつまみ'),
    alcoholPairing: getCheckbox(props, 'アルコールに合う'),
    recommendedAlcohols: getMultiSelect(props, 'おすすめアルコール種'),
    likesSeafood: getCheckbox(props, '海鮮好き向け'),
    likesMeat: getCheckbox(props, '肉好き向け'),
    likesSpicy: getCheckbox(props, '辛党向け'),
    customerPreferences: getMultiSelect(props, '好み'),
  };
}

export async function getMenuByExactName(name: string): Promise<MenuRecord | null> {
  const data = await notionQueryDataSource(menuDataSourceId(), {
    filter: {
      property: 'Name',
      title: {
        equals: name,
      },
    },
    page_size: 10,
  });

  const items = (data.results ?? []).map(mapMenu);
  return items.find((item: MenuRecord) => isSameMenuName(item.name, name)) ?? items[0] ?? null;
}

export async function getMenuByPageId(pageId: string): Promise<MenuRecord | null> {
  const page = await notionGetPage(pageId);
  return mapMenu(page);
}

export async function searchRecommendableMenus(params: {
  timeContext?: 'lunch' | 'dinner' | 'anytime';
  drinkContext?: string | null;
  preferenceTags?: string[];
  foodCategoryHint?: string[];
}): Promise<MenuRecord[]> {
  const filters: any[] = [
    { property: '表示ON/OFF', checkbox: { equals: true } },
    { property: '提供可能', checkbox: { equals: true } },
  ];

  if (params.timeContext === 'lunch') {
    filters.push({
      or: [
        { property: '提供時間帯', select: { equals: 'ランチ' } },
        { property: '今日のランチおすすめ', checkbox: { equals: true } },
      ],
    });
  }

  if (params.timeContext === 'dinner') {
    filters.push({
      or: [
        { property: '提供時間帯', select: { equals: 'ディナー' } },
        { property: '今夜のおすすめ', checkbox: { equals: true } },
      ],
    });
  }

  if (params.drinkContext) {
    filters.push({
      property: 'アルコールに合う',
      checkbox: { equals: true },
    });
  }

  const data = await notionQueryDataSource(menuDataSourceId(), {
    filter: { and: filters },
    page_size: 50,
  });

  return (data.results ?? []).map(mapMenu);
}
