import { timingSafeEqual } from "node:crypto";

function bearerMatches(header: string | null, secret: string | undefined) {
  const token = secret?.trim();
  if (!token) return false;
  const actual = header?.trim() ?? "";
  const expected = `Bearer ${token}`;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function techBotSecretsConfigured() {
  return Boolean(process.env.TECH_NEWS_INGEST_TOKEN?.trim() || process.env.CRON_SECRET?.trim());
}

export function isTechBotAuthorized(authorization: string | null) {
  return (
    bearerMatches(authorization, process.env.TECH_NEWS_INGEST_TOKEN) ||
    bearerMatches(authorization, process.env.CRON_SECRET)
  );
}
