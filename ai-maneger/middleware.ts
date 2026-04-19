import { NextRequest, NextResponse } from "next/server";

const TENANT_HEADER = "x-tenant-key";
const TENANT_COOKIE = "tenant_key";
const AUTH_SESSION_COOKIE = "auth_session";

function unauthorizedApi() {
  return NextResponse.json(
    { ok: false, message: "ログインが必要です。" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function normalizeTenantKey(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "demo" || normalized === "ootsuki" ? normalized : null;
}

function parseTenantHostMap() {
  const raw = process.env.TENANT_HOST_MAP?.trim();
  if (!raw) return {} as Record<string, "demo" | "ootsuki">;

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([host, tenant]) => [host.toLowerCase(), normalizeTenantKey(tenant)])
        .filter((entry): entry is [string, "demo" | "ootsuki"] => Boolean(entry[1])),
    );
  } catch {
    return Object.fromEntries(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [host, tenant] = entry.split("=").map((value) => value.trim());
          return [host?.toLowerCase(), normalizeTenantKey(tenant)] as const;
        })
        .filter((entry): entry is readonly [string, "demo" | "ootsuki"] => Boolean(entry[0] && entry[1])),
    );
  }
}

function resolveTenantFromHost(host: string | null) {
  const hostname = host?.split(":")[0].trim().toLowerCase();
  if (!hostname) return null;

  const hostMap = parseTenantHostMap();
  if (hostMap[hostname]) return hostMap[hostname];

  if (hostname === "demo" || hostname.startsWith("demo.")) return "demo";
  if (hostname === "ootsuki" || hostname.startsWith("ootsuki.")) return "ootsuki";
  return null;
}

function resolveTenant(request: NextRequest) {
  const fromQuery = normalizeTenantKey(request.nextUrl.searchParams.get("tenant"));
  if (fromQuery) {
    return { tenant: fromQuery, persistCookie: true };
  }

  const fromHeader = normalizeTenantKey(request.headers.get(TENANT_HEADER));
  if (fromHeader) {
    return { tenant: fromHeader, persistCookie: false };
  }

  const fromCookie = normalizeTenantKey(request.cookies.get(TENANT_COOKIE)?.value);
  if (fromCookie) {
    return { tenant: fromCookie, persistCookie: false };
  }

  const fromHost = resolveTenantFromHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  if (fromHost) {
    return { tenant: fromHost, persistCookie: false };
  }

  return { tenant: null, persistCookie: false };
}

function nextWithTenant(request: NextRequest) {
  const { tenant, persistCookie } = resolveTenant(request);
  const requestHeaders = new Headers(request.headers);

  if (tenant) {
    requestHeaders.set(TENANT_HEADER, tenant);
  } else {
    requestHeaders.delete(TENANT_HEADER);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (tenant && persistCookie) {
    response.cookies.set(TENANT_COOKIE, tenant, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicPage = pathname === "/login";
  const isAuthCookiePresent = Boolean(request.cookies.get(AUTH_SESSION_COOKIE)?.value);

  if (!isAuthCookiePresent && !isPublicPage) {
    if (pathname.startsWith("/api/")) {
      return unauthorizedApi();
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const nextPath =
      pathname === "/"
        ? "/dashboard"
        : `${pathname}${request.nextUrl.search || ""}`;
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  return nextWithTenant(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
