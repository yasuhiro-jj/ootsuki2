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
 * resolve6 / resolve4 で取ったアドレスを host に直接渡す（connectionString へ埋め戻すと、
 * pg 側の再パースで IPv6 の角カッコ付きホストがそのまま getaddrinfo に渡り ENOTFOUND になるため、
 * 文字列の埋め戻しはせず Pool の個別オプションとして渡す）。
 */
export async function resolvePostgresPoolOptions(raw: string) {
  const unquoted = raw.replace(/^["']|["']$/g, "");
  if (!/^postgres(?:ql)?:\/\//i.test(unquoted)) {
    throw new Error("TENANT_CONFIG_DB_URL は postgresql:// 形式で設定してください。");
  }

  const url = new URL(unquoted.replace(/^postgresql:/i, "http:").replace(/^postgres:/i, "http:"));
  // URL.hostname は IPv6 を "[::1]" の形で返すが、pg / net には角カッコ無しで渡す必要がある
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const isSupabaseDirectHost = /^db\.[^.]+\.supabase\.(?:co|com)$/i.test(hostname);
  const isSupabasePoolerHost = /\.pooler\.supabase\.com$/i.test(hostname);

  if (hostname === "base" || /^db\.(?:abcdefghijklmnop|your-project-ref)\.supabase\.co$/i.test(hostname)) {
    throw new Error("TENANT_CONFIG_DB_URL のホストがプレースホルダーです。Supabase Connect の実際の接続文字列を設定してください。");
  }
  if (/YOUR[-_ ]?PASSWORD|\[PASSWORD\]/i.test(password)) {
    throw new Error("TENANT_CONFIG_DB_URL にパスワードのプレースホルダーが残っています。");
  }
  if (isSupabasePoolerHost && !username.includes(".")) {
    throw new Error("Supabase Session pooler のユーザー名には project-ref が必要です。Connect に表示された postgres.<project-ref> を使ってください。");
  }

  // Vercel 関数からは IPv4 を優先する。Direct 接続が IPv6 専用なら、曖昧な socket エラーを避けて pooler を案内する。
  let host = hostname;
  if (hostname) {
    const v4 = await dnsPromises.resolve4(hostname).catch(() => [] as string[]);
    if (v4.length > 0) {
      host = v4[0];
    } else {
      const v6 = await dnsPromises.resolve6(hostname).catch(() => [] as string[]);
      if (v6.length > 0 && process.env.VERCEL === "1" && isSupabaseDirectHost) {
        throw new Error("TENANT_CONFIG_DB_URL の Supabase Direct 接続は IPv6 専用です。Vercel では Connect の Session pooler (port 5432) を使用してください。");
      }
      if (v6.length > 0) host = v6[0];
    }
  }

  return {
    host,
    port: url.port ? Number(url.port) : 5432,
    user: username,
    password,
    database: url.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  };
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  if (!poolInitPromise) {
    poolInitPromise = (async () => {
      const raw = read(process.env.TENANT_CONFIG_DB_URL);
      if (!raw) {
        throw new Error("TENANT_CONFIG_DB_URL が未設定です");
      }
      const options = await resolvePostgresPoolOptions(raw);
      pool = new Pool(options);
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
