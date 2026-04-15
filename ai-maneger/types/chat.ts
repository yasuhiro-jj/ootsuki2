export type AgentChatRequestBody = {
  message: string;
  sessionId?: string;
  agentName?: string;
  agentRole?: string;
};

export type AgentChatSuccessResponse = {
  ok: true;
  reply: string;
  sessionId: string;
  source: "ootsuki-dashboard-agent";
  fallbackUsed: boolean;
};

export type AgentChatErrorResponse = {
  ok: false;
  error: "agent_failed" | "validation_error" | "missing_config";
  message?: string;
};

export type AgentChatResponse = AgentChatSuccessResponse | AgentChatErrorResponse;
