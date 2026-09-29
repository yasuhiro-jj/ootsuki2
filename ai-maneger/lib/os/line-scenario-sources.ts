import { getPropertyDate, getPropertyNumber, getPropertyText, queryDatabaseAllWithToken } from "@/lib/notion/client";
import { pickLatestScenarioSteps, type LineScenarioStepRecord } from "@/lib/os/line-scenario";
import { getTenantNotionConfig } from "@/lib/tenant-config/service";
import type { TenantKey } from "@/lib/tenant-config/types";
import type { LineScenarioSection } from "@/types/os";

const OOTSUKI_LINE_SCENARIO_DB_ID = "19c008d7cd264ff8a4cec4032115a550";
const OOTSUKI_LINE_SCENARIO_DATA_SOURCE_ID = "e7b7112c-0d00-403e-9dae-d2cfb7e4f12f";

function lineScenarioDbId(tenant: TenantKey) {
  const env =
    tenant === "demo"
      ? (process.env.NOTION_DEMO_LINE_SCENARIO_DB_ID || "").trim()
      : (process.env.NOTION_OOTSUKI_LINE_SCENARIO_DB_ID || "").trim();
  return env || (tenant === "ootsuki" ? OOTSUKI_LINE_SCENARIO_DB_ID : "");
}

function mapPage(page: { properties: Record<string, unknown> }): LineScenarioStepRecord | null {
  const properties = page.properties as Parameters<typeof getPropertyText>[0];
  const fetchedAt = getPropertyDate(properties, ["取得日"]) || "";
  if (!fetchedAt) return null;

  const stepName = getPropertyText(properties, ["ステップ名", "Name"]) || "";
  const stepNumberRaw = getPropertyNumber(properties, ["ステップ番号"]);
  const stepNumber = stepNumberRaw ?? null;

  return {
    stepName,
    stepNumber: stepNumber === null ? null : stepNumber,
    timing: getPropertyText(properties, ["タイミング"]) || "",
    sent: getPropertyNumber(properties, ["送信済"]) ?? null,
    clickRate: getPropertyNumber(properties, ["クリック率"]) ?? null,
    blocks: getPropertyNumber(properties, ["ブロック"]) ?? null,
    scenarioName: getPropertyText(properties, ["シナリオ名"]) || "",
    fetchedAt: fetchedAt.length === 10 ? `${fetchedAt}T12:00:00.000Z` : fetchedAt,
  };
}

/** Notion「おおつき LINEシナリオDB」を読み取りのみ。 */
export async function loadLineScenarioSection(tenant: TenantKey): Promise<LineScenarioSection | null> {
  const databaseId = lineScenarioDbId(tenant);
  if (!databaseId) return null;

  const config = await getTenantNotionConfig(tenant);
  if (!config.notionToken) return null;

  let pages = await queryDatabaseAllWithToken(config.notionToken, databaseId, {}).catch(() => null);
  if ((!pages || pages.length === 0) && tenant === "ootsuki") {
    pages = await queryDatabaseAllWithToken(config.notionToken, OOTSUKI_LINE_SCENARIO_DATA_SOURCE_ID, {}).catch(
      () => null,
    );
  }
  if (!pages || pages.length === 0) {
    console.warn("[os] LINEシナリオDBから行を取得できませんでした。ai-company の接続を確認してください:", databaseId);
    return null;
  }

  const rows = pages.map(mapPage).filter((row): row is LineScenarioStepRecord => Boolean(row));
  return pickLatestScenarioSteps(rows);
}
