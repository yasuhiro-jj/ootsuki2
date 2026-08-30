export type MarketingService = "instagram" | "gbp" | "canva";

export type MarketingChannel = MarketingService | "multi";

export type MarketingActionPriority = "high" | "medium" | "low";

export type MarketingActionStatus =
  | "proposed"
  | "approved"
  | "in_progress"
  | "executed"
  | "measuring"
  | "completed"
  | "rejected";

export type MarketingGoalType =
  | "instagram_reach"
  | "instagram_non_follower_reach"
  | "gbp_views"
  | "gbp_actions"
  | "reviews"
  | "reservations"
  | "line_registrations"
  | "sales"
  | "custom";

export type MarketingGoalStatus = "active" | "completed" | "paused";

export type IntegrationConnectionStatus = "connected" | "disconnected" | "expired" | "error";

export type MarketingStore = {
  id: string;
  tenantKey: string;
  name: string;
  agencyId?: string;
  instagramAccountId?: string;
  gbpLocationId?: string;
  canvaBrandId?: string;
  instagramAppUrl?: string;
  gbpAppUrl?: string;
  canvaAppUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketingGoal = {
  id: string;
  tenantKey: string;
  storeId: string;
  title: string;
  description?: string;
  goalType: MarketingGoalType;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  startDate?: string;
  endDate?: string;
  status: MarketingGoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type MarketingGoalInput = {
  storeId?: string;
  title: string;
  description?: string;
  goalType: MarketingGoalType;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  startDate?: string;
  endDate?: string;
  status?: MarketingGoalStatus;
};

export type MarketingMetric = {
  key: string;
  label: string;
  value?: number;
  unit?: string;
  previousValue?: number;
  absoluteChange?: number;
  deltaPercent?: number;
  interpretation?: string;
};

export type MarketingChannelMetrics = {
  channel: "instagram" | "gbp";
  label: string;
  status: "connected" | "manual" | "not_configured";
  source: string;
  fetchedAt: string;
  period?: {
    start: string;
    end: string;
  };
  errorMessage?: string;
  lastSuccessfulFetchedAt?: string;
  metrics: MarketingMetric[];
};

export type MarketingActionEvidence = {
  metric: string;
  currentValue?: number;
  previousValue?: number;
  changeRate?: number;
  explanation: string;
};

export type MarketingActionDestination = {
  key: MarketingService;
  label: string;
  href: string;
  mode: "external_app_redirect" | "internal_api" | "external_api";
};

export type MarketingAction = {
  id: string;
  tenantKey: string;
  storeId: string;
  title: string;
  reason: string;
  evidence: MarketingActionEvidence[];
  targetChannel: MarketingChannel;
  contentTheme: string;
  priority: MarketingActionPriority;
  targetKpi: string;
  recommendedAction: string;
  status: MarketingActionStatus;
  approvalStatus: "pending" | "approved" | "changes_requested" | "rejected";
  approvedBy?: string;
  approvedAt?: string;
  revisionNote?: string;
  metricsSnapshot: MarketingChannelMetrics[];
  evaluation: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketingActionInput = {
  storeId?: string;
  title: string;
  reason: string;
  evidence?: MarketingActionEvidence[];
  targetChannel: MarketingChannel;
  contentTheme: string;
  priority: MarketingActionPriority;
  targetKpi: string;
  recommendedAction: string;
};

export type MarketingActionExecution = {
  id: string;
  tenantKey: string;
  actionId: string;
  storeId: string;
  channel: MarketingChannel;
  executedAt?: string;
  externalPostId?: string;
  externalUrl?: string;
  metricsBefore?: Record<string, unknown>;
  metricsAfter?: Record<string, unknown>;
  resultSummary?: string;
  aiEvaluation?: string;
  score?: number;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationStatus = {
  service: MarketingService;
  status: IntegrationConnectionStatus;
  lastCheckedAt?: string;
  errorMessage?: string;
};

export type MarketingCommandCenterData = {
  store: MarketingStore;
  goals: MarketingGoal[];
  metrics: MarketingChannelMetrics[];
  actions: MarketingAction[];
  integrationStatuses: IntegrationStatus[];
};
