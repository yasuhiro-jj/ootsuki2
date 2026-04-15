import type { AgentChatSuccessResponse } from '@/types/chat';

/** Notion Agents API が付与する言語タグを除去（公式 SDK の stripLangTags と同等） */
export function stripLangTags(text: string): string {
  return text.replace(/<\/?lang[^>]*>/g, '');
}

export function buildSuccessResponse(params: {
  reply: string;
  threadId: string;
  fallbackUsed: boolean;
}): AgentChatSuccessResponse {
  return {
    ok: true,
    reply: stripLangTags(params.reply).trim(),
    sessionId: params.threadId,
    source: 'notion-agent',
    fallbackUsed: params.fallbackUsed,
  };
}
