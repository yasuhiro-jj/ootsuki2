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

const sql = `
CREATE TABLE IF NOT EXISTS tenant_conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key  TEXT        NOT NULL,
  session_id  TEXT        NOT NULL,
  principal_id TEXT       NOT NULL DEFAULT '',
  agent_name  TEXT        NOT NULL DEFAULT '',
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_conversations_tenant_session
  ON tenant_conversations(tenant_key, session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_tenant_conversations_tenant_created
  ON tenant_conversations(tenant_key, created_at DESC);
`;

const client = new Client(await resolvePostgresConnectionOptions(dbUrlRaw));

try {
  await client.connect();
  await client.query(sql);
  console.log("tenant_conversations table migrated.");
} catch (error) {
  console.error("migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
