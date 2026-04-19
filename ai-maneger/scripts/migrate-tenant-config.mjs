import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
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

const schemaPath = path.resolve(process.cwd(), "db/schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

const connectionString = await resolvePostgresConnectionString(dbUrlRaw);
const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query(sql);
  console.log("tenant_configs schema migrated.");
} catch (error) {
  console.error("migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
