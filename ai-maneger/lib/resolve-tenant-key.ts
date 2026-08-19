import { normalizeTenantKey, resolveTenantKeyFromHost } from "@/lib/tenant-config/service";

const TENANT_COOKIE = "tenant_key";

function parseCookieTenantKey(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TENANT_COOKIE}=`));
  if (!entry) return null;
  const key = normalizeTenantKey(entry.slice(`${TENANT_COOKIE}=`.length));
  return key;
}

/**
 * Cookie（tenant_key）→ URL クエリ（?tenant=）→ Host の順でテナントを解決する。
 * ootsuki / demo 以外は例外。
 */
export function resolveTenantKey(req: Request): string {
  const fromCookie = parseCookieTenantKey(req.headers.get("cookie"));
  if (fromCookie) return fromCookie;

  const fromQuery = normalizeTenantKey(new URL(req.url).searchParams.get("tenant"));
  if (fromQuery) return fromQuery;

  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const fromHost = resolveTenantKeyFromHost(hostHeader);
  if (fromHost) return fromHost;

  throw new Error(
    "tenant_key を特定できませんでした。Cookie tenant_key、?tenant=、またはホスト名で ootsuki / demo を指定してください。",
  );
}
