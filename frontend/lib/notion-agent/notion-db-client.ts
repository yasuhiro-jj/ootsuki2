/**
 * 通常の Notion API（ページ・DB 読み取り）で、メニュー・店舗情報を取得する。
 * Agents API（Alpha）が不要な構成。
 */

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

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

async function queryDatabase(dbId: string, pageSize = 50): Promise<string[]> {
  if (!dbId) return [];
  const res = await fetch(`${NOTION_BASE}/databases/${dbId}/query`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ page_size: pageSize }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[notion-db] DB ${dbId} query failed (${res.status}):`, text);
    return [];
  }

  const data = (await res.json()) as { results: any[] };
  return data.results.map((page: any) => rowToText(page.properties));
}

export type NotionContext = {
  menu: string[];
  store: string[];
  conversation: string[];
  unknownKeywords: string[];
  conversationNodes: string[];
};

export async function fetchNotionContext(): Promise<NotionContext> {
  const menuDbId = process.env.NOTION_DATABASE_ID_MENU ?? '';
  const storeDbId = process.env.NOTION_DATABASE_ID_STORE ?? '';
  const conversationDbId = process.env.NOTION_DATABASE_ID_CONVERSATION ?? '';
  const unknownKwDbId = process.env.NOTION_DATABASE_ID_UNKNOWN_KEYWORDS ?? '';
  const convNodesDbId = process.env.NOTION_DB_CONVERSATION ?? '';

  const [menu, store, conversation, unknownKeywords, conversationNodes] =
    await Promise.all([
      queryDatabase(menuDbId, 100),
      queryDatabase(storeDbId, 20),
      queryDatabase(conversationDbId, 50),
      queryDatabase(unknownKwDbId, 50),
      queryDatabase(convNodesDbId, 50),
    ]);

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
