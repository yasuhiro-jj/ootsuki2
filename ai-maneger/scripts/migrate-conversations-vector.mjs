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

// text-embedding-3-small のデフォルト次元数
const EMBEDDING_DIMS = 1536;

const sql = `
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE tenant_conversations
  ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIMS});

CREATE INDEX IF NOT EXISTS idx_tenant_conversations_embedding
  ON tenant_conversations
  USING hnsw (embedding vector_cosine_ops);
`;

const client = new Client(await resolvePostgresConnectionOptions(dbUrlRaw));

try {
  await client.connect();
  await client.query(sql);
  console.log("tenant_conversations vector column + HNSW index migrated.");
} catch (error) {
  console.error("migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
