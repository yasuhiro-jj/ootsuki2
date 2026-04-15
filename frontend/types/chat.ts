/**
 * 第2チャット（Notion Agent）用の型定義
 */

export type AgentChatRequestBody = {
  message: string;
  sessionId?: string;
};

export type AgentChatSuccessResponse = {
  ok: true;
  reply: string;
  sessionId: string;
  source: 'notion-agent' | 'notion-db-openai';
  fallbackUsed: boolean;
};

export type AgentChatErrorResponse = {
  ok: false;
  error: 'agent_failed' | 'validation_error' | 'missing_config';
  /** UI 向けの短い説明（任意） */
  message?: string;
};

export type AgentChatResponse = AgentChatSuccessResponse | AgentChatErrorResponse;
