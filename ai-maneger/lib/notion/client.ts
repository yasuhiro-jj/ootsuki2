import type { MinimalPageBlock, NotionBlock, NotionPage, NotionProperty } from "@/types/notion";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = process.env.NOTION_API_VERSION?.trim() || "2022-06-28";

async function notionHeaders() {
  const config = await getActiveTenantNotionConfig();
  const token = config.notionToken;
  if (!token) {
    throw new Error("NOTION_API_KEY が未設定です");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionFetch<T>(path: string, init?: RequestInit) {
  const headers = await notionHeaders();
  const response = await fetch(`${NOTION_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as T | { message?: string }) : ({} as T);
  if (!response.ok) {
    const message =
      typeof json === "object" && json !== null && "message" in json
        ? String(json.message || `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export async function getDatabaseSchemaProperties(databaseOrDataSourceId: string) {
  if (!databaseOrDataSourceId) return {} as Record<string, NotionProperty>;

  try {
    const database = await notionFetch<{ properties?: Record<string, NotionProperty> }>(
      `/databases/${databaseOrDataSourceId}`,
    );
    return database.properties ?? {};
  } catch {
    // Fall through to data source lookup.
  }

  try {
    const dataSource = await notionFetch<{ properties?: Record<string, NotionProperty> }>(
      `/data-sources/${databaseOrDataSourceId}`,
    );
    return dataSource.properties ?? {};
  } catch {
    return {} as Record<string, NotionProperty>;
  }
}

export function toText(items?: Array<{ plain_text?: string }>) {
  return (items ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

export function getPropertyByAliases(
  properties: Record<string, NotionProperty>,
  aliases: string[],
): NotionProperty | undefined {
  for (const alias of aliases) {
    if (properties[alias]) return properties[alias];
  }

  const loweredEntries = Object.entries(properties).map(([key, value]) => [key.toLowerCase(), value] as const);
  for (const alias of aliases) {
    const matched = loweredEntries.find(([key]) => key === alias.toLowerCase());
    if (matched) return matched[1];
  }

  return undefined;
}

export function getPropertyNameByAliases(
  properties: Record<string, NotionProperty>,
  aliases: string[],
) {
  for (const alias of aliases) {
    if (properties[alias]) return alias;
  }

  const loweredEntries = Object.keys(properties).map((key) => [key.toLowerCase(), key] as const);
  for (const alias of aliases) {
    const matched = loweredEntries.find(([key]) => key === alias.toLowerCase());
    if (matched) return matched[1];
  }

  return undefined;
}

export function getPropertyText(properties: Record<string, NotionProperty>, aliases: string[]) {
  const prop = getPropertyByAliases(properties, aliases);
  if (!prop) return "";
  return propertyToText(prop);
}

export function getPropertyNumber(properties: Record<string, NotionProperty>, aliases: string[]) {
  const prop = getPropertyByAliases(properties, aliases);
  if (!prop) return undefined;
  if (typeof prop.number === "number") return prop.number;
  if (typeof prop.formula?.number === "number") return prop.formula.number;
  if (typeof prop.rollup?.number === "number") return prop.rollup.number;
  const text = propertyToText(prop).replace(/,/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getPropertyCheckbox(properties: Record<string, NotionProperty>, aliases: string[]) {
  const prop = getPropertyByAliases(properties, aliases);
  if (!prop) return false;
  if (typeof prop.checkbox === "boolean") return prop.checkbox;
  return /^(true|yes|1|はい)$/i.test(propertyToText(prop));
}

export function getPropertyDate(properties: Record<string, NotionProperty>, aliases: string[]) {
  const prop = getPropertyByAliases(properties, aliases);
  if (!prop) return "";
  return prop.date?.start?.slice(0, 10) || propertyToText(prop).slice(0, 10);
}

export function propertyToText(prop?: NotionProperty): string {
  if (!prop) return "";
  if (prop.title) return toText(prop.title);
  if (prop.rich_text) return toText(prop.rich_text);
  if (typeof prop.number === "number") return String(prop.number);
  if (typeof prop.formula?.number === "number") return String(prop.formula.number);
  if (typeof prop.rollup?.number === "number") return String(prop.rollup.number);
  if (typeof prop.formula?.string === "string") return prop.formula.string;
  if (typeof prop.formula?.boolean === "boolean") return prop.formula.boolean ? "true" : "false";
  if (prop.formula?.date?.start) return prop.formula.date.start;
  if (prop.rollup?.date?.start) return prop.rollup.date.start;
  if (prop.rollup?.array?.length) return prop.rollup.array.map((item) => propertyToText(item)).join(", ");
  if (typeof prop.checkbox === "boolean") return prop.checkbox ? "true" : "false";
  if (prop.url) return prop.url;
  if (prop.select?.name) return prop.select.name;
  if (prop.status?.name) return prop.status.name;
  if (prop.multi_select?.length) return prop.multi_select.map((item) => item.name ?? "").filter(Boolean).join(", ");
  if (prop.date?.start) return prop.date.start;
  return "";
}

export async function queryDatabaseAll(databaseId: string, body: Record<string, unknown> = {}) {
  if (!databaseId) return [] as NotionPage[];

  const queryAllPages = async (path: string) => {
    const results: NotionPage[] = [];
    let hasMore = true;
    let startCursor: string | undefined;

    while (hasMore) {
      const response = await notionFetch<{
        results: NotionPage[];
        has_more: boolean;
        next_cursor?: string | null;
      }>(path, {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...body,
          ...(startCursor ? { start_cursor: startCursor } : {}),
        }),
      });

      results.push(...response.results);
      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }

    return results;
  };

  try {
    return await queryAllPages(`/databases/${databaseId}/query`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const needsDataSourceFallback =
      message.includes("does not contain any data sources accessible by this API bot") ||
      message.includes("Could not find database with ID");

    if (!needsDataSourceFallback) {
      throw error;
    }
  }

  // New Notion workspaces can require querying a data source instead of /databases/{id}/query.
  // 1) try using this ID as a data source ID directly.
  try {
    return await queryAllPages(`/data-sources/${databaseId}/query`);
  } catch {
    // 2) fallback to data_sources listed under the database object.
  }

  const database = await notionFetch<{ data_sources?: Array<{ id?: string }> }>(`/databases/${databaseId}`);
  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error(`Database ${databaseId} has no accessible data source.`);
  }
  return await queryAllPages(`/data-sources/${dataSourceId}/query`);
}

export async function getPage(pageId: string) {
  return notionFetch<NotionPage>(`/pages/${pageId}`);
}

export async function createPage(payload: Record<string, unknown>) {
  return notionFetch<NotionPage>("/pages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function isDatabaseParentFallbackError(message: string) {
  return (
    message.includes("Could not find database with ID") ||
    message.includes("does not contain any data sources accessible by this API bot")
  );
}

export async function createPageInDatabase(
  databaseOrDataSourceId: string,
  properties: Record<string, unknown>,
  extraPayload: Record<string, unknown> = {},
) {
  if (!databaseOrDataSourceId) {
    throw new Error("Notion parent ID is missing.");
  }

  try {
    return await createPage({
      ...extraPayload,
      parent: { database_id: databaseOrDataSourceId },
      properties,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!isDatabaseParentFallbackError(message)) {
      throw error;
    }
  }

  try {
    return await createPage({
      ...extraPayload,
      parent: { data_source_id: databaseOrDataSourceId },
      properties,
    });
  } catch {
    // Fall through to data source lookup from database metadata.
  }

  const database = await notionFetch<{ data_sources?: Array<{ id?: string }> }>(
    `/databases/${databaseOrDataSourceId}`,
  );
  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error(`Database ${databaseOrDataSourceId} has no accessible data source.`);
  }

  return await createPage({
    ...extraPayload,
    parent: { data_source_id: dataSourceId },
    properties,
  });
}

export async function updatePage(pageId: string, payload: Record<string, unknown>) {
  return notionFetch<NotionPage>(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getBlockChildren(blockId: string) {
  const response = await notionFetch<{ results: NotionBlock[] }>(
    `/blocks/${blockId}/children?page_size=100`,
  );
  return response.results;
}

export function blockToMinimal(block: NotionBlock): MinimalPageBlock | null {
  const supportedTypes = [
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
  ] as const;

  if (!supportedTypes.includes(block.type as (typeof supportedTypes)[number])) {
    return null;
  }

  const richText =
    block.paragraph?.rich_text ||
    block.heading_1?.rich_text ||
    block.heading_2?.rich_text ||
    block.heading_3?.rich_text ||
    block.bulleted_list_item?.rich_text ||
    [];

  const text = toText(richText);
  if (!text) return null;

  return {
    id: block.id,
    type: block.type as MinimalPageBlock["type"],
    text,
  };
}
