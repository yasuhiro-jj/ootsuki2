/**
 * 通常の Notion API（ページ・DB 読み取り）で、メニュー・店舗情報を取得する。
 * Agents API（Alpha）が不要な構成。
 */

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DEFAULT_MENU_DB_ID = '258e9a7e-e5b7-8054-922d-e365bec99064';
const DEFAULT_STORE_DB_ID = '262e9a7e-e5b7-806e-911c-e966a0ccf7fe';
const DEFAULT_CONVERSATION_DB_ID = '700563e396c84f8f89adafb90c51ca3f';
const DEFAULT_UNKNOWN_KEYWORDS_DB_ID = '6cccf26b198645f2b08d71fb9b1d01f0';
const DEFAULT_CONVERSATION_NODES_DB_ID = '700563e396c84f8f89adafb90c51ca3f';

function getNotionToken(): string {
  const token =
    process.env.NOTION_API_TOKEN?.trim() ||
    process.env.NOTION_API_KEY?.trim() ||
    '';
  return token;
}

function headers() {
  return {
    Authorization: `Bearer ${getNotionToken()}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

type RichText = { plain_text: string }[];

function richTextToString(rt?: RichText): string {
  if (!rt) return '';
  return rt.map((t) => t.plain_text).join('');
}

function extractPropertyValue(prop: any): string {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
      return richTextToString(prop.title);
    case 'rich_text':
      return richTextToString(prop.rich_text);
    case 'number':
      return prop.number != null ? String(prop.number) : '';
    case 'select':
      return prop.select?.name ?? '';
    case 'multi_select':
      return (prop.multi_select ?? []).map((s: any) => s.name).join(', ');
    case 'checkbox':
      return prop.checkbox ? 'はい' : 'いいえ';
    case 'url':
      return prop.url ?? '';
    case 'phone_number':
      return prop.phone_number ?? '';
    case 'email':
      return prop.email ?? '';
    default:
      return '';
  }
}

function rowToText(properties: Record<string, any>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(properties)) {
    const v = extractPropertyValue(val);
    if (v) parts.push(`${key}: ${v}`);
  }
  return parts.join(' / ');
}

function extractMenuSearchTerms(message?: string): string[] {
  if (!message) return [];
  const text = message.trim().toLowerCase();
  const knownTerms = [
    'ノンアルコールビール',
    '中生ビール',
    '大生ビール',
    '小生ビール',
    'メガビール',
    '瓶ビール',
    '生ビール',
    'ビール',
    'ハイボール',
    '酎ハイ',
    '日本酒',
    '焼酎',
    'ワイン',
    'ソフトドリンク',
  ];

  const terms = knownTerms.filter((term) => text.includes(term.toLowerCase()));
  let cleaned = text.replace(/[?？!！。．、,]/g, ' ');
  for (const word of [
    'ありますか',
    'あるかな',
    'ある',
    'あります',
    'ございますか',
    'ございます',
    '置いてますか',
    '置いてる',
    '飲めますか',
    '飲める',
    'メニュー',
    'ください',
    '下さい',
    '教えて',
    'って',
    'とは',
    'は',
    'を',
    'が',
    'の',
  ]) {
    cleaned = cleaned.replaceAll(word.toLowerCase(), ' ');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length >= 2) terms.push(cleaned);

  return Array.from(new Set(terms));
}

async function queryDatabase(
  dbId: string,
  pageSize = 50,
  filter?: Record<string, unknown>
): Promise<string[]> {
  if (!dbId) return [];
  const res = await fetch(`${NOTION_BASE}/databases/${dbId}/query`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      page_size: pageSize,
      ...(filter ? { filter } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[notion-db] DB ${dbId} query failed (${res.status}):`, text);
    return [];
  }

  const data = (await res.json()) as { results: any[] };
  return data.results.map((page: any) => rowToText(page.properties));
}

async function queryMenuByMessage(menuDbId: string, message?: string): Promise<string[]> {
  const terms = extractMenuSearchTerms(message);
  if (terms.length === 0) return [];

  const rows: string[] = [];
  const seen = new Set<string>();
  for (const term of terms.slice(0, 5)) {
    const found = await queryDatabase(menuDbId, 10, {
      property: 'Name',
      title: { contains: term },
    });
    for (const row of found) {
      if (!seen.has(row)) {
        seen.add(row);
        rows.push(row);
      }
    }
  }
  return rows;
}

export type NotionContext = {
  menu: string[];
  store: string[];
  conversation: string[];
  unknownKeywords: string[];
  conversationNodes: string[];
};

export async function fetchNotionContext(message?: string): Promise<NotionContext> {
  const menuDbId = process.env.NOTION_DATABASE_ID_MENU ?? DEFAULT_MENU_DB_ID;
  const storeDbId = process.env.NOTION_DATABASE_ID_STORE ?? DEFAULT_STORE_DB_ID;
  const conversationDbId =
    process.env.NOTION_DATABASE_ID_CONVERSATION ?? DEFAULT_CONVERSATION_DB_ID;
  const unknownKwDbId =
    process.env.NOTION_DATABASE_ID_UNKNOWN_KEYWORDS ?? DEFAULT_UNKNOWN_KEYWORDS_DB_ID;
  const convNodesDbId = process.env.NOTION_DB_CONVERSATION ?? DEFAULT_CONVERSATION_NODES_DB_ID;

  const [focusedMenu, fallbackMenu, store, conversation, unknownKeywords, conversationNodes] =
    await Promise.all([
      queryMenuByMessage(menuDbId, message),
      queryDatabase(menuDbId, 100),
      queryDatabase(storeDbId, 20),
      queryDatabase(conversationDbId, 50),
      queryDatabase(unknownKwDbId, 50),
      queryDatabase(convNodesDbId, 50),
    ]);

  const menu = focusedMenu.length > 0 ? focusedMenu : fallbackMenu;

  return { menu, store, conversation, unknownKeywords, conversationNodes };
}

export function notionContextToText(ctx: NotionContext): string {
  const parts: string[] = [];

  if (ctx.store.length > 0) {
    parts.push('【店舗情報】');
    parts.push(ctx.store.join('\n'));
  }

  if (ctx.menu.length > 0) {
    parts.push('【メニュー】');
    parts.push(ctx.menu.join('\n'));
  }

  if (ctx.conversation.length > 0) {
    parts.push('【会話パターン・FAQ】');
    parts.push(ctx.conversation.join('\n'));
  }

  if (ctx.conversationNodes.length > 0) {
    parts.push('【会話ノード】');
    parts.push(ctx.conversationNodes.join('\n'));
  }

  if (ctx.unknownKeywords.length > 0) {
    parts.push('【不明キーワード（過去の未回答質問）】');
    parts.push(ctx.unknownKeywords.join('\n'));
  }

  return parts.join('\n\n');
}
