import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import pg from "pg";

const { Pool } = pg;
dns.setDefaultResultOrder("verbatim");
const root = process.cwd();
const envPath = path.join(root, ".env.local");
const migrationPath = path.join(root, "db", "migrations", "20260830_marketing_command_center_phase2.sql");

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] && key !== "TENANT_CONFIG_DB_URL") continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function requireDbUrl() {
  const value = process.env.TENANT_CONFIG_DB_URL?.trim();
  if (!value) {
    throw new Error("TENANT_CONFIG_DB_URL is not configured.");
  }
  return value.replace(/^["']|["']$/g, "");
}

async function resolvePostgresConnectionString(raw) {
  const unquoted = raw.replace(/^["']|["']$/g, "");
  try {
    const url = new URL(unquoted.replace(/^postgresql:/i, "http:"));
    const hostname = url.hostname;
    if (!hostname) return unquoted;

    const v6 = await dnsPromises.resolve6(hostname).catch(() => []);
    if (v6.length > 0) {
      url.hostname = `[${v6[0]}]`;
      return url.toString().replace(/^http:/i, "postgresql:");
    }

    const v4 = await dnsPromises.resolve4(hostname).catch(() => []);
    if (v4.length > 0) {
      url.hostname = v4[0];
      return url.toString().replace(/^http:/i, "postgresql:");
    }
  } catch {
    return unquoted;
  }
  return unquoted;
}

async function buildPoolConfig(raw) {
  const value = raw.replace(/^["']|["']$/g, "");
  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    return { connectionString: await resolvePostgresConnectionString(value) };
  }

  const withoutProtocol = value.replace(/^postgres(?:ql)?:\/\//i, "");
  const atIndex = withoutProtocol.lastIndexOf("@");
  if (atIndex < 0) return { connectionString: value };

  const auth = withoutProtocol.slice(0, atIndex);
  const hostAndPath = withoutProtocol.slice(atIndex + 1);
  const colonIndex = auth.indexOf(":");
  const user = colonIndex >= 0 ? auth.slice(0, colonIndex) : auth;
  const password = colonIndex >= 0 ? auth.slice(colonIndex + 1) : "";
  const slashIndex = hostAndPath.indexOf("/");
  const hostPort = slashIndex >= 0 ? hostAndPath.slice(0, slashIndex) : hostAndPath;
  const pathAndQuery = slashIndex >= 0 ? hostAndPath.slice(slashIndex + 1) : "postgres";
  const [database, query = ""] = pathAndQuery.split("?");
  const lastColon = hostPort.lastIndexOf(":");
  const host = lastColon >= 0 ? hostPort.slice(0, lastColon) : hostPort;
  const port = lastColon >= 0 ? Number(hostPort.slice(lastColon + 1)) : 5432;
  const params = new URLSearchParams(query);

  const v6 = await dnsPromises.resolve6(host.replace(/^\[|\]$/g, "")).catch(() => []);
  const v4 = await dnsPromises.resolve4(host.replace(/^\[|\]$/g, "")).catch(() => []);
  const resolvedHost = v6[0] || v4[0] || host.replace(/^\[|\]$/g, "");

  return {
    user,
    password,
    host: resolvedHost,
    originalHost: host.replace(/^\[|\]$/g, ""),
    port,
    database: database || "postgres",
    ssl: params.get("sslmode") ? { rejectUnauthorized: false } : undefined,
  };
}

function maskConfig(config) {
  return {
    host: config.originalHost || config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password ? "***" : "(empty)",
    sslmode: config.ssl ? "enabled/no-verify" : "default",
    pooler:
      String(config.originalHost || config.host).includes("pooler.supabase.com") && Number(config.port) === 6543
        ? "Supavisor transaction pooler"
        : String(config.originalHost || config.host).includes("pooler.supabase.com") && Number(config.port) === 5432
          ? "Supavisor session pooler"
          : String(config.originalHost || config.host).startsWith("db.")
            ? "Direct connection"
            : "unknown",
  };
}

function poolConfigForMode(baseConfig, mode) {
  const projectRef = String(baseConfig.user || "").includes(".")
    ? String(baseConfig.user).split(".").slice(1).join(".")
    : String(baseConfig.originalHost || "").match(/^db\.([^.]+)\.supabase\.co$/)?.[1] || "";
  if (mode === "direct" && projectRef) {
    return {
      ...baseConfig,
      user: "postgres",
      host: `db.${projectRef}.supabase.co`,
      originalHost: `db.${projectRef}.supabase.co`,
      port: 5432,
    };
  }
  if (mode === "session") {
    return { ...baseConfig, port: 5432 };
  }
  return baseConfig;
}

async function testConnection(config) {
  const { originalHost, ...poolConfig } = config;
  const pool = new Pool({ ...poolConfig, connectionTimeoutMillis: 10000 });
  try {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT current_database() AS database, current_user AS user");
      return { ok: true, row: result.rows[0] };
    } finally {
      client.release();
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function diagnose() {
  const base = await buildPoolConfig(requireDbUrl());
  for (const mode of ["transaction", "session", "direct"]) {
    const config = poolConfigForMode(base, mode);
    const masked = maskConfig(config);
    console.log(`\n[${mode}]`);
    console.log(JSON.stringify(masked, null, 2));
    const result = await testConnection(config);
    if (result.ok) {
      console.log("connection: ok");
      console.log(`database: ${result.row.database}`);
      console.log(`user: ${result.row.user}`);
    } else {
      console.log("connection: failed");
      console.log(`error: ${result.message}`);
    }
  }
}

async function inspect(client) {
  const tables = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`,
  );
  const marketingTables = tables.rows
    .map((row) => row.table_name)
    .filter((name) => String(name).startsWith("marketing_"));
  const columns = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'marketing_stores',
          'marketing_goals',
          'marketing_actions',
          'marketing_action_executions',
          'marketing_integration_statuses'
        )
      ORDER BY table_name, ordinal_position`,
  );
  const rls = await client.query(
    `SELECT relname, relrowsecurity
       FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN (
          'tenant_configs',
          'tenant_memberships',
          'tenant_audit_logs',
          'marketing_stores',
          'marketing_goals',
          'marketing_actions',
          'marketing_action_executions',
          'marketing_integration_statuses'
        )
      ORDER BY relname`,
  );

  console.log("Existing table count:", tables.rowCount);
  console.log("Existing marketing tables:", marketingTables.length ? marketingTables.join(", ") : "(none)");
  console.log("Marketing columns:");
  for (const row of columns.rows) {
    console.log(`- ${row.table_name}.${row.column_name}: ${row.data_type}, nullable=${row.is_nullable}`);
  }
  console.log("RLS:");
  for (const row of rls.rows) {
    console.log(`- ${row.relname}: ${row.relrowsecurity ? "enabled" : "disabled"}`);
  }
}

async function migrate(client, targetPath = migrationPath) {
  const sql = fs.readFileSync(targetPath, "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Migration applied:", path.relative(root, targetPath));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seed(client) {
  const tenantKey = process.env.MARKETING_E2E_TENANT_KEY || "ootsuki";
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.tenant_key', $1, true)`, [tenantKey]);
    const store = await client.query(
      `INSERT INTO marketing_stores (
        tenant_key, name, instagram_account_id, gbp_location_id, canva_brand_id,
        instagram_app_url, gbp_app_url, canva_app_url, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT DO NOTHING
      RETURNING id`,
      [
        tenantKey,
        process.env.MARKETING_E2E_STORE_NAME || "食事処おおつき",
        process.env.MARKETING_E2E_INSTAGRAM_ACCOUNT_ID || "",
        process.env.MARKETING_E2E_GBP_LOCATION_ID || "",
        process.env.MARKETING_E2E_CANVA_BRAND_ID || "",
        process.env.NEXT_PUBLIC_INSTAGRAM_APP_URL || "/instagram",
        process.env.NEXT_PUBLIC_GBP_APP_URL || "/google-business-profile",
        process.env.NEXT_PUBLIC_CANVA_APP_URL || "/canva",
      ],
    );
    const storeId =
      store.rows[0]?.id ||
      (
        await client.query(
          `SELECT id FROM marketing_stores WHERE tenant_key = $1 ORDER BY created_at ASC LIMIT 1`,
          [tenantKey],
        )
      ).rows[0]?.id;

    if (!storeId) throw new Error("Failed to resolve marketing store id.");

    await client.query(
      `INSERT INTO marketing_goals (
        tenant_key, store_id, title, description, goal_type, target_value, unit, status, updated_at
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, 'active', NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM marketing_goals WHERE tenant_key = $1 AND store_id = $2 AND title = $3
      )`,
      [
        tenantKey,
        storeId,
        process.env.MARKETING_E2E_GOAL_TITLE || "Instagram非フォロワー到達率を30%以上にする",
        "Phase 2 E2E確認用の初期KPI",
        "instagram_non_follower_reach",
        30,
        "%",
      ],
    );

    await client.query("COMMIT");
    console.log("Seed tenant:", tenantKey);
    console.log("Seed store id:", storeId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function updateStoreLinks(client) {
  const tenantKey = process.env.MARKETING_E2E_TENANT_KEY || "ootsuki";
  const result = await client.query(
    `UPDATE marketing_stores
        SET instagram_account_id = COALESCE(NULLIF($2, ''), instagram_account_id),
            gbp_location_id = COALESCE(NULLIF($3, ''), gbp_location_id),
            updated_at = NOW()
      WHERE tenant_key = $1
      RETURNING id, instagram_account_id, gbp_location_id`,
    [
      tenantKey,
      process.env.MARKETING_E2E_INSTAGRAM_ACCOUNT_ID || "",
      process.env.MARKETING_E2E_GBP_LOCATION_ID || "",
    ],
  );
  console.log("Updated store links:", result.rows);
}

async function main() {
  loadEnvFile();
  const command = process.argv[2] || "inspect";
  if (command === "diagnose") {
    await diagnose();
    return;
  }
  const pool = new Pool(await buildPoolConfig(requireDbUrl()));
  const client = await pool.connect();
  try {
    if (command === "inspect") await inspect(client);
    else if (command === "migrate") {
      const explicitPath = process.argv[3] ? path.resolve(root, process.argv[3]) : migrationPath;
      await migrate(client, explicitPath);
    }
    else if (command === "seed") await seed(client);
    else if (command === "update-store-links") await updateStoreLinks(client);
    else if (command === "all") {
      await inspect(client);
      await migrate(client);
      await seed(client);
      await inspect(client);
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
