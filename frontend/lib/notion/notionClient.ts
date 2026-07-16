const NOTION_API_BASE = 'https://api.notion.com/v1';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function headers() {
  return {
    Authorization: `Bearer ${requireEnv('NOTION_API_TOKEN')}`,
    'Notion-Version': process.env.NOTION_VERSION?.trim() ?? '2025-09-03',
    'Content-Type': 'application/json',
  };
}

export async function notionQueryDataSource(dataSourceId: string, body: Record<string, any>) {
  if (!dataSourceId) throw new Error('Missing data source id');

  const res = await fetch(`${NOTION_API_BASE}/data-sources/${dataSourceId}/query`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion query failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function notionGetPage(pageId: string) {
  const res = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    method: 'GET',
    headers: headers(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion get page failed: ${res.status} ${text}`);
  }

  return res.json();
}
