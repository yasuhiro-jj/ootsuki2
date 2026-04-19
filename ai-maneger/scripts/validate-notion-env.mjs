import fs from "node:fs";
import path from "node:path";

const REQUIRED_NOTION_KEYS = [
  "NOTION_PROJECT_DB_ID",
  "NOTION_OOTSUKI_PROJECT_PAGE_ID",
  "NOTION_OOTSUKI_DAILY_SALES_DB_ID",
  "NOTION_OOTSUKI_KPI_DB_ID",
  "NOTION_OOTSUKI_MEMO_DB_ID",
  "NOTION_OOTSUKI_LINE_REPORT_PAGE_ID",
  "NOTION_OOTSUKI_PRODUCT_COST_DB_ID",
  "NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID",
];

const OPTIONAL_KEYS = [
  "NOTION_API_VERSION",
  "NEXT_PUBLIC_APP_NAME",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_TEMPERATURE",
];

function parseEnvFile(envPath) {
  const content = fs.readFileSync(envPath, "utf8");
  const entries = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    entries[key] = value;
  }

  return entries;
}

function isNotionIdLike(value) {
  const normalized = value.replace(/-/g, "");
  return /^[a-fA-F0-9]{32}$/.test(normalized);
}

function main() {
  const targetPathArg = process.argv[2] || ".env.local";
  const targetMode = (process.argv[3] || "").toLowerCase();
  const envPath = path.resolve(process.cwd(), targetPathArg);

  if (!fs.existsSync(envPath)) {
    console.error(`[ERROR] env file not found: ${envPath}`);
    process.exit(1);
  }

  const env = parseEnvFile(envPath);
  const errors = [];
  const warnings = [];

  const hasApiKey = Boolean(env.NOTION_API_KEY?.trim());
  const hasApiToken = Boolean(env.NOTION_API_TOKEN?.trim());
  if (!hasApiKey && !hasApiToken) {
    errors.push("NOTION_API_KEY または NOTION_API_TOKEN のいずれかが必要です。");
  }

  for (const key of REQUIRED_NOTION_KEYS) {
    const value = env[key]?.trim();
    if (!value) {
      errors.push(`${key} が未設定です。`);
      continue;
    }

    if (!isNotionIdLike(value)) {
      errors.push(`${key} は Notion ID 形式（32桁hex、ハイフン可）ではありません: ${value}`);
    }
  }

  if (targetMode === "demo") {
    const label = env.NOTION_ENV_LABEL?.trim().toLowerCase();
    if (label !== "demo") {
      errors.push("demo モードでは NOTION_ENV_LABEL=demo の設定が必要です。");
    }
  }

  const seen = new Map();
  for (const key of REQUIRED_NOTION_KEYS) {
    const value = env[key]?.trim();
    if (!value) continue;
    const normalized = value.replace(/-/g, "").toLowerCase();
    if (seen.has(normalized)) {
      warnings.push(`${key} が ${seen.get(normalized)} と同一 ID です（意図した設定か確認してください）。`);
    } else {
      seen.set(normalized, key);
    }
  }

  if (warnings.length > 0) {
    console.warn("[WARN] 以下を確認してください:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error("[ERROR] Notion 環境変数チェックに失敗しました:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const presentOptional = OPTIONAL_KEYS.filter((key) => Boolean(env[key]?.trim()));
  console.log("[OK] Notion 環境変数チェックが完了しました。");
  console.log(`- target file: ${envPath}`);
  console.log(`- mode: ${targetMode || "default"}`);
  console.log(`- optional keys present: ${presentOptional.length}/${OPTIONAL_KEYS.length}`);
}

main();
