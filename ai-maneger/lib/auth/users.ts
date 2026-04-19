import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type AuthUserRecord = {
  id: string;
  passwordHash: string;
  displayName?: string;
};

function read(value?: string | null) {
  return value?.trim() || "";
}

function parseAuthUsers(): AuthUserRecord[] {
  const raw = read(process.env.APP_AUTH_USERS_JSON);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const id = read(typeof record.id === "string" ? record.id : "");
        const passwordHash = read(typeof record.passwordHash === "string" ? record.passwordHash : "");
        const displayName = read(typeof record.displayName === "string" ? record.displayName : "");
        if (!id || !passwordHash) return null;
        return { id, passwordHash, ...(displayName ? { displayName } : {}) };
      })
      .filter((entry): entry is AuthUserRecord => Boolean(entry));
  } catch {
    return [];
  }
}

export function listAuthUsers() {
  return parseAuthUsers();
}

export function findAuthUser(id: string) {
  const normalized = read(id);
  return parseAuthUsers().find((user) => user.id === normalized) || null;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, expectedHash] = passwordHash.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHash) return false;

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "base64");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("base64");
  return `scrypt$${salt}$${derived}`;
}

