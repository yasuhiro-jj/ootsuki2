import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import nextEnv from "@next/env";
import { resolvePostgresConnectionOptions } from "./postgres-connection-options.mjs";

nextEnv.loadEnvConfig(process.cwd());

const { Client } = pg;

const dbUrlRaw = process.env.TENANT_CONFIG_DB_URL?.trim();
if (!dbUrlRaw) {
  console.error("TENANT_CONFIG_DB_URL が未設定です。");
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), "db/schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

const client = new Client(await resolvePostgresConnectionOptions(dbUrlRaw));

try {
  await client.connect();
  await client.query(sql);
  await client.query(
    "ALTER TABLE tenant_configs ADD COLUMN IF NOT EXISTS instructions_page_id TEXT NOT NULL DEFAULT ''",
  );
  console.log("tenant_configs schema migrated.");
} catch (error) {
  console.error("migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
