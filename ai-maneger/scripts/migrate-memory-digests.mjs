import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import pg from "pg";
import nextEnv from "@next/env";

dns.setDefaultResultOrder("verbatim");
nextEnv.loadEnvConfig(process.cwd());

const { Client } = pg;

async function resolvePostgresConnectionString(raw) {
  const unquoted = raw.replace(/^["']|["']$/g, "");
  try {
    const url = new URL(unquoted.replace(/^postgresql:/i, "http:"));
    const hostname = url.hostname;
    if (!hostname) return unquoted;

    const v6 = await dnsPromises.resolve6(hostname).catch(() => []);
    if (v6.length > 0) {
      url.hostname = `[${v6[0]}]`;
      return url.toString().replace(/^https:/i, "postgresql:");
    }

    const v4 = await dnsPromises.resolve4(hostname).catch(() => []);
    if (v4.length > 0) {
      url.hostname = v4[0];
      return url.toString().replace(/^https:/i, "postgresql:");
    }
  } catch {
    // ignore
  }
  return unquoted;
}

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

const connectionString = await resolvePostgresConnectionString(dbUrlRaw);
const client = new Client({ connectionString });

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
