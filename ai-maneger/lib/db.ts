import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { Pool, type PoolClient } from "pg";

// IPv6 のみ AAAA が返る環境で、Node の IPv4 優先 DNS が ENOTFOUND になるのを避ける
dns.setDefaultResultOrder("verbatim");

let pool: Pool | null = null;
let poolInitPromise: Promise<Pool> | null = null;

function read(value?: string) {
  return value?.trim() || "";
}

/**
 * Supabase の db.*.supabase.co が AAAA のみのとき、pg の getaddrinfo が ENOTFOUND になることがある。
 * resolve6 / resolve4 で取ったアドレスをホストに埋め込んで接続する。
 */
export async function resolvePostgresConnectionString(raw: string): Promise<string> {
  const unquoted = raw.replace(/^["']|["']$/g, "");
  try {
    const url = new URL(unquoted.replace(/^postgresql:/i, "http:"));
    const hostname = url.hostname;
    if (!hostname) return unquoted;

    const v6 = await dnsPromises.resolve6(hostname).catch(() => [] as string[]);
    if (v6.length > 0) {
      url.hostname = `[${v6[0]}]`;
      return url.toString().replace(/^http:/i, "postgresql:");
    }

    const v4 = await dnsPromises.resolve4(hostname).catch(() => [] as string[]);
    if (v4.length > 0) {
      url.hostname = v4[0];
      return url.toString().replace(/^http:/i, "postgresql:");
    }
  } catch {
    // fall through
  }
  return unquoted;
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  if (!poolInitPromise) {
    poolInitPromise = (async () => {
      const raw = read(process.env.TENANT_CONFIG_DB_URL);
      if (!raw) {
        throw new Error("TENANT_CONFIG_DB_URL が未設定です");
      }
      const connectionString = await resolvePostgresConnectionString(raw);
      pool = new Pool({ connectionString });
      return pool;
    })();
  }
  return poolInitPromise;
}

export async function closePool(): Promise<void> {
  const existingPool = pool;
  pool = null;
  poolInitPromise = null;
  if (existingPool) {
    await existingPool.end();
  }
}

/**
 * RLS が current_setting('app.tenant_key', true) を参照するテーブル向け。
 * BEGIN → set_config(..., true) → fn → COMMIT で GUC をトランザクション境界内に閉じ、接続プール汚染を防ぐ。
 */
export async function withTenant<T>(tenantKey: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const poolInstance = await getPool();
  const client = await poolInstance.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_key', $1, true)`, [tenantKey]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw e;
  } finally {
    client.release();
  }
}
