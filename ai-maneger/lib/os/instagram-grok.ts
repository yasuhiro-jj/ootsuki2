export const INSTAGRAM_GROK_SOURCE_LABEL = "Grok Bot";

export function isInstagramGrokBotSource(source: string | undefined | null) {
  if (!source?.trim()) return false;
  return /grok\s*bot/i.test(source);
}