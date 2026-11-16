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

export function instagramIngestSecretsConfigured() {
  return Boolean(
    process.env.MARKETING_INSTAGRAM_INGEST_TOKEN?.trim() ||
      process.env.GROK_BOT_INGEST_TOKEN?.trim() ||
      process.env.CRON_SECRET?.trim(),
  );
}

export function isInstagramIngestAuthorized(authorization: string | null) {
  return (
    bearerMatches(authorization, process.env.MARKETING_INSTAGRAM_INGEST_TOKEN) ||
    bearerMatches(authorization, process.env.GROK_BOT_INGEST_TOKEN) ||
    bearerMatches(authorization, process.env.CRON_SECRET)
  );
}