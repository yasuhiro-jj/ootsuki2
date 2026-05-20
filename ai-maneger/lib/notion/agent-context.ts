import type { TenantKey } from "@/lib/tenant-config/types";
import { propertyToText, queryDatabaseAll } from "@/lib/notion/client";

const MAX_ROWS = 12;
const MAX_FIELDS_PER_ROW = 6;
const MAX_FIELD_TEXT_LENGTH = 120;

function read(value?: string | null) {
  return value?.trim() || "";
}

function toHyphenatedNotionId(id32: string) {
  const normalized = id32.toLowerCase();
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function extractNotionDatabaseId(rawValue: string) {
  const raw = read(rawValue);
  if (!raw) return "";

  const idPattern = /([0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
  const matched = raw.match(idPattern);
  if (!matched) return "";

  const stripped = matched[1].replace(/-/g, "");
  if (stripped.length !== 32) return "";
  return toHyphenatedNotionId(stripped);
}

function resolveReferenceDbIds(tenant: TenantKey) {
  const tenantRaw =
    tenant === "demo"
      ? read(process.env.NOTION_DEMO_AGENT_REFERENCE_DB_ID)
      : read(process.env.NOTION_OOTSUKI_AGENT_REFERENCE_DB_ID);
  const fallbackRaw = read(process.env.NOTION_AGENT_REFERENCE_DB_ID);
  const merged = [tenantRaw, fallbackRaw].filter(Boolean).join(",");
  const ids = merged
    .split(",")
    .map((value) => extractNotionDatabaseId(value))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function clip(text: string, max = MAX_FIELD_TEXT_LENGTH) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export async function getAlwaysOnNotionReferenceContext(tenant: TenantKey) {
  const dbIds = resolveReferenceDbIds(tenant);
  if (!dbIds.length) return "";

  const sections: string[] = [];
  for (const dbId of dbIds) {
    const rows = await queryDatabaseAll(dbId, {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    });

    if (!rows.length) {
      sections.push(`【DB ID: ${dbId}】\n- レコードが見つかりません。`);
      continue;
    }

    const lines: string[] = [];
    for (const row of rows.slice(0, MAX_ROWS)) {
      const fields = Object.entries(row.properties)
        .map(([key, property]) => [key, propertyToText(property).trim()] as const)
        .filter(([, value]) => Boolean(value))
        .slice(0, MAX_FIELDS_PER_ROW)
        .map(([key, value]) => `${key}: ${clip(value)}`);

      if (!fields.length) continue;
      lines.push(`- ${fields.join(" / ")} (更新: ${row.last_edited_time.slice(0, 10)})`);
    }

    sections.push([`【DB ID: ${dbId}】`, ...(lines.length ? lines : ["- 有効なテキスト項目なし"])]
      .join("\n"));
  }

  return [
    "【常時参照Notion DB（最優先）】",
    `参照DB数: ${dbIds.length}`,
    "以下すべてのDB内容を根拠として使い、矛盾があればユーザー確認を促すこと。",
    ...sections,
  ].join("\n");
}
