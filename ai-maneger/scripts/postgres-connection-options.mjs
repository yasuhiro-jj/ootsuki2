import { isIP } from "node:net";
import dnsPromises from "node:dns/promises";
import pgConnectionString from "pg-connection-string";

const { parse } = pgConnectionString;

function normalizeHost(hostname) {
  return String(hostname || "").replace(/^\[|\]$/g, "");
}

export async function resolvePostgresHost(hostname) {
  const normalized = normalizeHost(hostname);
  if (!normalized || isIP(normalized)) return normalized;

  // Prefer IPv4 for Vercel/AWS Lambda egress; use IPv6 only when no A record exists.
  const v4 = await dnsPromises.resolve4(normalized).catch(() => []);
  if (v4.length > 0) return v4[0];

  const v6 = await dnsPromises.resolve6(normalized).catch(() => []);
  return v6[0] || normalized;
}

export async function resolvePostgresConnectionOptions(raw) {
  const connectionString = String(raw).replace(/^[\"']|[\"']$/g, "");
  const options = parse(connectionString);
  const originalHost = normalizeHost(options.host);
  if (!originalHost) throw new Error("TENANT_CONFIG_DB_URL にホスト名がありません。");

  return {
    ...options,
    host: await resolvePostgresHost(originalHost),
    originalHost,
  };
}
