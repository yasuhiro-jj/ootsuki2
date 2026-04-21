import { NextResponse } from "next/server";
import { verifyAuthSessionToken } from "@/lib/auth/session";
import { normalizeTenantKey, resolveTenantKey } from "@/lib/tenant-config/service";
import { fetchTenantMembershipRecord } from "@/lib/tenant-config/repository";
import type { TenantKey, TenantRole } from "@/lib/tenant-config/types";

const TENANT_HEADER = "x-tenant-key";
const TENANT_COOKIE = "tenant_key";
const AUTH_USER_HEADER = "x-auth-user";

type TenantAction = "read" | "write" | "admin";

export type CurrentAccessContext = {
  tenant: TenantKey | null;
  principalId: string | null;
  role: TenantRole | null;
};

export type TenantAccessGrant = {
  tenant: TenantKey;
  principalId: string;
  role: TenantRole;
};

export type TenantAccessDecision =
  | ({ ok: true } & TenantAccessGrant)
  | {
      ok: false;
      status: number;
      message: string;
      tenant: TenantKey | null;
      principalId: string | null;
    };

function parseCookieTenant(cookieHeader: string | null): TenantKey | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TENANT_COOKIE}=`));
  if (!entry) return null;
  return normalizeTenantKey(entry.slice(`${TENANT_COOKIE}=`.length));
}

function resolveTenantFromRequest(request: Request): TenantKey | null {
  const url = new URL(request.url);
  const fromQuery = normalizeTenantKey(url.searchParams.get("tenant"));
  if (fromQuery) return fromQuery;

  const fromHeader = normalizeTenantKey(request.headers.get(TENANT_HEADER));
  if (fromHeader) return fromHeader;

  const fromCookie = parseCookieTenant(request.headers.get("cookie"));
  if (fromCookie) return fromCookie;

  return null;
}

function parseCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

function resolvePrincipalFromRequest(request: Request): string | null {
  const fromHeader = request.headers.get(AUTH_USER_HEADER)?.trim();
  if (fromHeader) return fromHeader;
  const session = verifyAuthSessionToken(parseCookieValue(request.headers.get("cookie"), "auth_session"));
  return session?.sub || null;
}

function getAllowedTenants(action: TenantAction): Set<TenantKey> {
  const envKey =
    action === "admin"
      ? "TENANT_ADMIN_ALLOWLIST"
      : action === "write"
        ? "TENANT_WRITE_ALLOWLIST"
        : "TENANT_READ_ALLOWLIST";
  const raw = process.env[envKey]?.trim();
  const defaults: TenantKey[] = action === "admin" ? ["ootsuki"] : ["ootsuki", "demo"];
  const values = raw
    ? raw
        .split(",")
        .map((entry) => normalizeTenantKey(entry))
        .filter((entry): entry is TenantKey => Boolean(entry))
    : defaults;
  return new Set(values);
}

export function forbidden(message: string, tenant?: TenantKey | null, principalId?: string | null) {
  return NextResponse.json(
    {
      ok: false,
      message,
      ...(tenant ? { tenant } : {}),
      ...(principalId ? { principalId } : {}),
    },
    { status: 403 },
  );
}

function getRequiredRoles(action: TenantAction): TenantRole[] {
  switch (action) {
    case "admin":
      return ["admin", "owner"];
    case "write":
      return ["editor", "admin", "owner"];
    default:
      return ["viewer", "editor", "admin", "owner"];
  }
}

async function evaluateTenantAccess(
  tenant: TenantKey | null,
  principalId: string | null,
  action: TenantAction,
): Promise<TenantAccessDecision> {
  if (!tenant) {
    return {
      ok: false,
      status: 400,
      message: "tenant を特定できませんでした。?tenant=demo または tenant_key Cookie を確認してください。",
      tenant: null,
      principalId,
    };
  }

  if (!principalId) {
    return {
      ok: false,
      status: 401,
      message: "認証ユーザーを特定できませんでした。",
      tenant,
      principalId: null,
    };
  }

  const allowedTenants = getAllowedTenants(action);
  if (!allowedTenants.has(tenant)) {
    return {
      ok: false,
      status: 403,
      message: `tenant=${tenant} は ${action} 操作を許可されていません。`,
      tenant,
      principalId,
    };
  }

  const requiredRoles = getRequiredRoles(action);
  const membership = await fetchTenantMembershipRecord(tenant, principalId);
  if (membership && requiredRoles.includes(membership.role)) {
    return { ok: true, tenant, principalId, role: membership.role };
  }

  return {
    ok: false,
    status: 403,
    message: `principal=${principalId} は tenant=${tenant} の ${action} 権限を持っていません。`,
    tenant,
    principalId,
  };
}

export async function requireTenantAccess(
  request: Request,
  action: TenantAction,
): Promise<{ ok: true } & TenantAccessGrant | { ok: false; response: NextResponse }> {
  const tenantFromRequest = resolveTenantFromRequest(request);
  const tenant = tenantFromRequest ?? (await resolveTenantKey());
  const principalId = resolvePrincipalFromRequest(request);
  const decision = await evaluateTenantAccess(tenant, principalId, action);
  if (decision.ok) return decision;

  return {
    ok: false,
    response:
      decision.status === 403
        ? forbidden(decision.message, decision.tenant, decision.principalId)
        : NextResponse.json(
            {
              ok: false,
              message: decision.message,
              ...(decision.tenant ? { tenant: decision.tenant } : {}),
              ...(decision.principalId ? { principalId: decision.principalId } : {}),
            },
            { status: decision.status },
          ),
  };
}

export async function getCurrentTenantAccessResult(action: TenantAction): Promise<TenantAccessDecision> {
  try {
    const nextHeaders = await import("next/headers");
    const headerStore = await nextHeaders.headers();
    const cookieStore = await nextHeaders.cookies();

    const tenantHint =
      normalizeTenantKey(headerStore.get(TENANT_HEADER)) ||
      normalizeTenantKey(cookieStore.get(TENANT_COOKIE)?.value);
    const tenant = tenantHint ?? (await resolveTenantKey());
    const principalId =
      headerStore.get(AUTH_USER_HEADER)?.trim() || verifyAuthSessionToken(cookieStore.get("auth_session")?.value)?.sub || null;

    return evaluateTenantAccess(tenant ?? null, principalId, action);
  } catch {
    return {
      ok: false,
      status: 500,
      message: "tenant 認可情報を確認できませんでした。",
      tenant: null,
      principalId: null,
    };
  }
}

export async function requireCurrentTenantAccess(action: TenantAction): Promise<TenantAccessGrant> {
  const decision = await getCurrentTenantAccessResult(action);
  if (decision.ok) return decision;
  throw new Error(decision.message);
}

export async function getCurrentAccessContext(request?: Request): Promise<CurrentAccessContext> {
  if (request) {
    const tenantFromRequest = resolveTenantFromRequest(request);
    const tenant = tenantFromRequest ?? (await resolveTenantKey());
    const principalId = resolvePrincipalFromRequest(request);
    if (!principalId) {
      return { tenant, principalId, role: null };
    }
    const membership = await fetchTenantMembershipRecord(tenant, principalId);
    return {
      tenant,
      principalId,
      role: membership?.role || null,
    };
  }

  try {
    const nextHeaders = await import("next/headers");
    const headerStore = await nextHeaders.headers();
    const cookieStore = await nextHeaders.cookies();

    const tenantHint =
      normalizeTenantKey(headerStore.get(TENANT_HEADER)) ||
      normalizeTenantKey(cookieStore.get(TENANT_COOKIE)?.value);
    const tenant = tenantHint ?? (await resolveTenantKey());
    const principalId =
      headerStore.get(AUTH_USER_HEADER)?.trim() || verifyAuthSessionToken(cookieStore.get("auth_session")?.value)?.sub || null;

    if (!principalId) {
      return { tenant, principalId: null, role: null };
    }

    const membership = await fetchTenantMembershipRecord(tenant, principalId);
    return {
      tenant,
      principalId,
      role: membership?.role || null,
    };
  } catch {
    return { tenant: null, principalId: null, role: null };
  }
}
