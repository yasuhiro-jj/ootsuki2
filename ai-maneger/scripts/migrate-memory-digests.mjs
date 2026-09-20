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
CREATE TABLE IF NOT EXISTS tenant_memory_digests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key   TEXT        NOT NULL,
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  digest_type  TEXT        NOT NULL DEFAULT 'weekly',
  summary      TEXT        NOT NULL,
  source_count INTEGER     NOT NULL DEFAULT 0,
  embedding    vector(1536),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_key, period_start, period_end, digest_type)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memory_digests_tenant
  ON tenant_memory_digests(tenant_key, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_memory_digests_embedding
  ON tenant_memory_digests
  USING hnsw (embedding vector_cosine_ops);
`;

const client = new Client(await resolvePostgresConnectionOptions(dbUrlRaw));

try {
  await client.connect();
  await client.query(sql);
  console.log("tenant_memory_digests table migrated.");
} catch (error) {
  console.error("migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
