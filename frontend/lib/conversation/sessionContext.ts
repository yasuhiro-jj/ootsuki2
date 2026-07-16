import type { ConversationContext } from '@/types/chat';

const store = new Map<string, ConversationContext>();

export function getSessionContext(sessionId: string): ConversationContext {
  const existing = store.get(sessionId);
  if (existing) return existing;

  const created: ConversationContext = { sessionId };
  store.set(sessionId, created);
  return created;
}

export function saveSessionContext(ctx: ConversationContext) {
  store.set(ctx.sessionId, ctx);
}
