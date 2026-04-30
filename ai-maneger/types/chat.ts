export type AgentChatRequestBody = {
  message: string;
  sessionId?: string;
  agentName?: string;
  agentRole?: string;
};

export type SalesAnalysisResult = {
  summary: string;
  facts: string[];
  hypotheses: string[];
  nextActions: string[];
};

export type LineProposalResult = {
  title: string;
  body: string;
  target: string;
  goal: string;
};

export type WeeklyReviewDraftResult = {
  highlights: string[];
  issues: string[];
  actions: string[];
};

export type RestaurantConsultResult = {
  currentAssessment: string;
  issues: string[];
  improvements: string[];
  firstStep: string;
};

export type StructuredAgentResult =
  | { type: "sales-analysis"; data: SalesAnalysisResult }
  | { type: "line-proposal"; data: LineProposalResult }
  | { type: "weekly-review"; data: WeeklyReviewDraftResult }
  | { type: "restaurant-consult"; data: RestaurantConsultResult };

export type AgentChatSuccessResponse = {
  ok: true;
  reply: string;
  sessionId: string;
  source: string;
  fallbackUsed: boolean;
  structured?: StructuredAgentResult;
};

export type AgentChatErrorResponse = {
  ok: false;
  error: "agent_failed" | "validation_error" | "missing_config";
  message?: string;
};

export type AgentChatResponse = AgentChatSuccessResponse | AgentChatErrorResponse;
