/**
 * 第2チャット（Notion Agent）用の型定義
 */

export type AgentChatRequestBody = {
  message: string;
  sessionId?: string;
};

export type ChatIntent =
  | 'price_check'
  | 'order'
  | 'recommend'
  | 'menu_info'
  | 'detail_followup'
  | 'availability_check'
  | 'unknown';

export type MenuRecord = {
  id: string;
  name: string;
  price: number | null;
  description: string;
  shortIntro: string;
  detail: string;
  setContents: string;
  category: string;
  subcategory: string;
  foodCategory: string;
  tags: string[];
  tastes: string[];
  recommendationReason: string;
  recommendationPriority: number;
  popularity: number;
  available: boolean;
  visible: boolean;
  inStock: boolean;
  stockStatus: string;
  timeBand: string;
  lunchRecommended: boolean;
  dinnerRecommended: boolean;
  snackRecommended: boolean;
  alcoholPairing: boolean;
  recommendedAlcohols: string[];
  likesSeafood: boolean;
  likesMeat: boolean;
  likesSpicy: boolean;
  customerPreferences: string[];
};

export type ConversationNode = {
  id: string;
  nodeName: string;
  triggerWords: string[];
  negativeKeywords: string[];
  category: string;
  contextType: string;
  purpose: string;
  responseTemplate: string;
  conditionText: string;
  timeCondition: string;
  priority: number;
  linkedMenuIds: string[];
  nextNodeIds: string[];
  status: string;
};

export type ConversationContext = {
  sessionId: string;
  lastMentionedMenuId?: string;
  lastMentionedMenuName?: string;
  lastRecommendedMenuId?: string;
  lastRecommendedMenuName?: string;
  lastQuotedMenuId?: string;
  lastQuotedMenuName?: string;
  lastOrderedMenuId?: string;
  lastOrderedMenuName?: string;
};

export type ParsedRequest = {
  intent: ChatIntent;
  message: string;
  explicitMenuName?: string | null;
  quantity?: number;
  hasPronounReference: boolean;
  hasRecommendedReference: boolean;
  asksPrice: boolean;
  asksDetail: boolean;
  asksAvailability: boolean;
  timeContext: 'lunch' | 'dinner' | 'anytime';
  drinkContext?: string | null;
  preferenceTags: string[];
};

export type ChatDomain = 'menu' | 'farm' | 'unknown';

export type FarmRecord = {
  id: string;
  name: string;
  price: number | null;
  inStock: boolean;
  stockCount: number | null;
  visible: boolean;
  available: boolean;
  harvestSeason: string;
  seasonal: boolean;
  category: string;
  variety: string;
  features: string;
  tasteProfile: string[];
  recommendationReason: string;
  usage: string;
  storageMethod: string;
  popularity: number;
  recommendationPriority: number;
};

export type AgentChatSuccessResponse = {
  ok: true;
  reply: string;
  sessionId: string;
  source:
    | 'notion-agent'
    | 'notion-db-openai'
    | 'natural-openai'
    | 'latest-unavailable'
    | 'notion-menu-db'
    | 'notion-node-and-menu-db'
    | 'notion-farm-db'
    | 'notion-conversation-node-and-menu-db';
  fallbackUsed: boolean;
  node?: Record<string, unknown>;
  menu?: Record<string, unknown> | null;
  farm?: Record<string, unknown> | null;
  debug?: Record<string, unknown>;
};

export type AgentChatErrorResponse = {
  ok: false;
  error: 'agent_failed' | 'validation_error' | 'missing_config';
  /** UI 向けの短い説明（任意） */
  message?: string;
};

export type AgentChatResponse = AgentChatSuccessResponse | AgentChatErrorResponse;
