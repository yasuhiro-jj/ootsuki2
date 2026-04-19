import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_COOKIE = "auth_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AuthSessionPayload = {
  sub: string;
  exp: number;
};

function read(value?: string | null) {
  return value?.trim() || "";
}

function getSessionSecret() {
  const secret = read(process.env.APP_AUTH_SESSION_SECRET);
  if (!secret) {
    throw new Error("APP_AUTH_SESSION_SECRET が未設定です。");
  }
  return secret;
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function sign(encodedPayload: string) {
  return base64UrlEncode(createHmac("sha256", getSessionSecret()).update(encodedPayload).digest());
}

export function createAuthSessionToken(principalId: string) {
  const payload: AuthSessionPayload = {
    sub: principalId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthSessionToken(token?: string | null): AuthSessionPayload | null {
  const raw = read(token);
  if (!raw) return null;

  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as AuthSessionPayload;
    if (!payload.sub || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

