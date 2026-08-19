/**
 * public テーブルの RLS 確認（会話・ダイジェスト・テナント台帳）
 *
 * 事前: TENANT_CONFIG_DB_URL を環境に設定してください（.env.local は読みません）。
 *
 *   npm run verify:rls-tenant-tables
 *
 * 注意: 接続ユーザーが postgres 等で rolbypassrls = true の場合、RLS は掛からず
 * 「GUC なしでも全件見える」ため、件数ベースの検証は無効です。
 */
import { closePool, getPool, withTenant } from "../lib/db";

type PgRoleRow = { current_user: string; rolbypassrls: boolean };

const TABLES_EXPECT_RLS = new Set([
  "tenant_audit_logs",
  "tenant_configs",
  "tenant_conversations",
  "tenant_memberships",
  "tenant_memory_digests",
]);

async function main() {
  const pool = await getPool();
  let bypass = true;

  const roleClient = await pool.connect();
  try {
    const who = await roleClient.query<PgRoleRow>(
      `SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    const row = who.rows[0];
    if (row) {
      bypass = Boolean(row.rolbypassrls);
      console.log("[接続] current_user =", row.current_user, "| rolbypassrls =", row.rolbypassrls);
      if (bypass) {
        console.warn(
          "[警告] BYPASSRLS のため、この接続では RLS が適用されません。RLS 検証は別ロール（例: アプリ用ロール）で行ってください。",
        );
      }
    }
  } finally {
    roleClient.release();
  }

  const rlsMeta = await pool.query<{ tablename: string; rowsecurity: boolean }>(
    `SELECT tablename, rowsecurity
       FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename`,
  );
  console.log("\n[pg_catalog] public テーブル rowsecurity:");
  let rlsMissing = false;
  for (const tbl of rlsMeta.rows) {
    console.log(`  ${tbl.tablename}: rowsecurity=${tbl.rowsecurity}`);
    if (!bypass && TABLES_EXPECT_RLS.has(tbl.tablename) && !tbl.rowsecurity) {
      console.warn(`    → [要対応] ${tbl.tablename} に RLS 未設定`);
      rlsMissing = true;
    }
  }
  if (!bypass && rlsMissing) {
    process.exitCode = 1;
  }

  for (const tenant of ["ootsuki", "demo"] as const) {
    const conv = await withTenant(tenant, async (client) => {
      const r = await client.query<{ tenant_key: string; n: string }>(
        `SELECT tenant_key, COUNT(*)::text AS n FROM tenant_conversations GROUP BY tenant_key ORDER BY tenant_key`,
      );
      return r.rows;
    });
    const badConv = conv.filter((x) => x.tenant_key !== tenant);
    console.log(`\n[withTenant '${tenant}'] tenant_conversations 集計:`, conv);
    console.log(
      badConv.length === 0
        ? `  → tenant_key がすべて '${tenant}' のみ（または 0 行）なら OK`
        : `  → NG: 他テナント行が見えています: ${JSON.stringify(badConv)}`,
    );

    const dig = await withTenant(tenant, async (client) => {
      const r = await client.query<{ tenant_key: string; n: string }>(
        `SELECT tenant_key, COUNT(*)::text AS n FROM tenant_memory_digests GROUP BY tenant_key ORDER BY tenant_key`,
      );
      return r.rows;
    });
    const badDig = dig.filter((x) => x.tenant_key !== tenant);
    console.log(`[withTenant '${tenant}'] tenant_memory_digests 集計:`, dig);
    console.log(
      badDig.length === 0
        ? `  → tenant_key がすべて '${tenant}' のみ（または 0 行）なら OK`
        : `  → NG: 他テナント行が見えています: ${JSON.stringify(badDig)}`,
    );

    const cfg = await withTenant(tenant, async (client) => {
      const r = await client.query<{ tenant_key: string; n: string }>(
        `SELECT tenant_key, COUNT(*)::text AS n FROM tenant_configs GROUP BY tenant_key ORDER BY tenant_key`,
      );
      return r.rows;
    });
    const badCfg = cfg.filter((x) => x.tenant_key !== tenant);
    console.log(`[withTenant '${tenant}'] tenant_configs 集計:`, cfg);
    console.log(
      badCfg.length === 0
        ? `  → tenant_key がすべて '${tenant}' のみ（または 0 行）なら OK`
        : `  → NG: ${JSON.stringify(badCfg)}`,
    );

    const mem = await withTenant(tenant, async (client) => {
      const r = await client.query<{ tenant_key: string; n: string }>(
        `SELECT tenant_key, COUNT(*)::text AS n FROM tenant_memberships GROUP BY tenant_key ORDER BY tenant_key`,
      );
      return r.rows;
    });
    const badMem = mem.filter((x) => x.tenant_key !== tenant);
    console.log(`[withTenant '${tenant}'] tenant_memberships 集計:`, mem);
    console.log(
      badMem.length === 0
        ? `  → tenant_key がすべて '${tenant}' のみ（または 0 行）なら OK`
        : `  → NG: ${JSON.stringify(badMem)}`,
    );

    const aud = await withTenant(tenant, async (client) => {
      const r = await client.query<{ tenant_key: string; n: string }>(
        `SELECT tenant_key, COUNT(*)::text AS n FROM tenant_audit_logs GROUP BY tenant_key ORDER BY tenant_key`,
      );
      return r.rows;
    });
    const badAud = aud.filter((x) => x.tenant_key !== tenant);
    console.log(`[withTenant '${tenant}'] tenant_audit_logs 集計:`, aud);
    console.log(
      badAud.length === 0
        ? `  → tenant_key がすべて '${tenant}' のみ（または 0 行）なら OK`
        : `  → NG: ${JSON.stringify(badAud)}`,
    );
  }

  const tablesNoGuc = [
    "tenant_conversations",
    "tenant_memory_digests",
    "tenant_configs",
    "tenant_memberships",
    "tenant_audit_logs",
  ] as const;

  console.log("\n[GUC なし・pool.query] 件数（RLS 対象ロールなら 0 期待）:");
  let anyVisibleNoGuc = false;
  for (const t of tablesNoGuc) {
    const raw = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${t}`);
    const n = Number(raw.rows[0]?.n ?? "0");
    console.log(`  ${t}: ${n}`);
    if (!bypass && n > 0) anyVisibleNoGuc = true;
  }

  if (!bypass) {
    if (anyVisibleNoGuc) {
      console.log("  → いずれかのテーブルで件数 > 0: RLS 未適用・BYPASSRLS・ポリシー不足の可能性があります。");
      process.exitCode = 1;
    } else {
      console.log("  → 上記いずれも 0 件（RLS による不可視またはテーブル空）。");
    }
  } else {
    console.log("  → BYPASSRLS のため GUC なし件数の検証はスキップ。");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await closePool();
});
