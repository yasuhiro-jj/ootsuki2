import type { ConversationContext, ParsedRequest } from '@/types/chat';

export function resolveMenuReference(
  parsed: ParsedRequest,
  ctx: ConversationContext
): { menuName?: string; resolvedBy: string } {
  if (parsed.explicitMenuName) {
    return { menuName: parsed.explicitMenuName, resolvedBy: 'explicit_menu' };
  }

  if (parsed.hasRecommendedReference && ctx.lastRecommendedMenuName) {
    return {
      menuName: ctx.lastRecommendedMenuName,
      resolvedBy: 'last_recommended',
    };
  }

  if (parsed.hasPronounReference && ctx.lastMentionedMenuName) {
    return {
      menuName: ctx.lastMentionedMenuName,
      resolvedBy: 'last_mentioned',
    };
  }

  if (parsed.hasPronounReference && ctx.lastOrderedMenuName) {
    return {
      menuName: ctx.lastOrderedMenuName,
      resolvedBy: 'last_ordered',
    };
  }

  return { resolvedBy: 'unresolved' };
}
