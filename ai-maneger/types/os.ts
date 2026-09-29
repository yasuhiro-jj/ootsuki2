/**
 * AI会社OS ダッシュボード データ契約
 * - DB テーブル（提案）: tasks / findings / task_events / decisions / metrics_snapshots / connectors / agent_runs
 * - 画面はこの型だけに依存する。API・DB 実装が変わっても UI は変更不要。
 */

/** 仕事（tasks.state）の状態遷移 */
export const TASK_STATES = [
  "DETECTED",
  "PROPOSED",
  "APPROVED",
  "EXECUTING",
  "COMPLETED",
  "REJECTED",
  "ON_HOLD",
  "SUPERSEDED",
  "FAILED",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** 社長の判断（decisions.decision） */
export const DECISION_TYPES = ["approve", "modify", "hold", "reject"] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

/** 判断→次状態 */
export const DECISION_TO_STATE: Record<DecisionType, TaskState> = {
  approve: "APPROVED",
  modify: "APPROVED",
  hold: "ON_HOLD",
  reject: "REJECTED",
};

export type Severity = 1 | 2 | 3 | 4 | 5;

/** 数値の出どころ。UI で「実績 / 算出 / サンプル」タグを出す */
export type DataOrigin = "actual" | "derived" | "sample" | "unavailable";

export type AgentKey =
  | "manager"
  | "executive"
  | "sales"
  | "marketing"
  | "acquisition"
  | "seo"
  | "sns"
  | "customer"
  | "inventory"
  | "finance"
  | "operations"
  | "data_quality";

export type GrokBotKey = "ai_manager_bot" | "search_console_bot" | "notion_bot" | "mail_bot";

/** 接続状況（connectors.status + source_type を UI 用に統合） */
export type ConnectorStatus =
  | "connected" // アプリ内コネクタで接続済
  | "grok_bot" // Grok Bot 経由（ingest API）
  | "manual" // 手入力 / CSV / Notion 経由
  | "partial" // 一部のみ（権限待ちなど）
  | "error"
  | "not_connected" // 未接続
  | "planned"; // 準備中（Phase N）

export type Phase = 1 | 2 | 3 | 4 | 5 | 6;

export interface Evidence {
  metric: string;
  current?: number | string;
  previous?: number | string;
  changeRate?: number; // %（-12.3 など）
  unit?: string;
  period?: string;
  source?: string;
  origin?: DataOrigin;
}

export interface Finding {
  id: string;
  agentKey: AgentKey;
  detectorKey: string;
  kind: "problem" | "opportunity" | "risk" | "data_quality";
  title: string;
  summary?: string;
  severity: Severity;
  confidence?: number; // 0..1
  evidence: Evidence[];
  detectedAt: string; // ISO
  occurrenceCount?: number;
  status: "open" | "promoted" | "suppressed" | "resolved" | "expired";
  source?: string; // "in_app" | "grok_bot:search-console" ...
  origin?: DataOrigin;
}

export interface Task {
  id: string;
  title: string;
  agentKey: AgentKey;
  viaGrokBot?: GrokBotKey;
  state: TaskState;
  severity: Severity;
  priorityScore: number; // 0..100
  detectedAt: string;
  whyNow: string; // なぜ今か
  proposal: string; // 提案内容
  steps?: string[];
  expectedEffect?: string;
  effort?: "S" | "M" | "L";
  executionMode: "manual" | "draft" | "internal" | "external";
  evidence: Evidence[];
  findingIds?: string[];
  holdUntil?: string;
  lastDecision?: Pick<Decision, "decision" | "reasonText" | "decidedAt">;
  origin?: DataOrigin;
}

export interface Decision {
  id: string;
  taskId: string;
  taskTitle: string;
  agentKey: AgentKey;
  decision: DecisionType;
  reasonCode?: string;
  reasonText?: string;
  decidedBy: string;
  decidedAt: string;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  taskTitle: string;
  fromState?: TaskState;
  toState: TaskState;
  actorType: "system" | "agent" | "user" | "grok_bot";
  actorLabel: string;
  note?: string;
  at: string;
}

export interface Metric {
  key: string;
  label: string;
  value: string; // 表示用に整形済み（例: "¥103,837"）
  sub?: string; // 補足（例: "9/27（土）"）
  /** ホバー説明（例: プロライン由来の友だち数） */
  hint?: string;
  delta?: number; // %
  deltaLabel?: string; // 例: "前年比"
  /** 増えると良い指標か（色分け用） */
  goodWhen?: "up" | "down";
  origin: DataOrigin;
}

export interface LineScenarioStepRow {
  stepNumber: number;
  stepName: string;
  sent: number | null;
  clickRate: number | null;
  blocks: number | null;
}

export interface LineScenarioSection {
  scenarioName: string;
  fetchedAt: string;
  steps: LineScenarioStepRow[];
}

export interface DomainPanel {
  key: string; // panel-registry の key と一致
  status: ConnectorStatus;
  statusNote?: string;
  metrics: Metric[];
  findings: Finding[];
  updatedAt?: string;
  lineScenario?: LineScenarioSection;
}

export interface AgentStatus {
  key: AgentKey;
  label: string;
  role: string;
  state: "ok" | "running" | "error" | "idle" | "planned";
  lastRunAt?: string;
  findingsCount: number;
  proposedCount?: number;
  acceptanceRate?: number; // 0..1（decisions から集計）
  phase?: Phase;
}

export interface GrokBotStatus {
  key: GrokBotKey;
  label: string;
  role: string; // 会社OSでの役割
  feeds: string; // 送る内容
  schedule?: string;
  lastIngestAt?: string;
  state: "ok" | "running" | "error" | "idle" | "not_linked";
  findingsCount: number;
}

export interface Connector {
  key: string;
  label: string;
  category: "sales" | "marketing" | "customer" | "operations" | "finance" | "web" | "knowledge";
  status: ConnectorStatus;
  via?: string; // 例: "Notion（毎晩 AI manager専用 bot）"
  lastSyncAt?: string;
  note?: string;
  phase?: Phase;
}

export interface AcceptanceStat {
  agentKey: AgentKey;
  label: string;
  approved: number;
  modified: number;
  held: number;
  rejected: number;
}

export interface HealthScore {
  score: number; // 0..100
  label: string;
  breakdown: { label: string; score: number }[];
  origin: DataOrigin;
}

export interface OsDashboardData {
  tenant: { key: string; name: string };
  businessDate: string; // 表示日（YYYY-MM-DD）
  generatedAt: string; // 最終更新 ISO
  isSample: boolean; // true の間は「サンプルデータ」バナーを表示
  health: HealthScore;
  kpis: Metric[];
  tasks: Task[];
  panels: DomainPanel[];
  agents: AgentStatus[];
  grokBots: GrokBotStatus[];
  timeline: TaskEvent[];
  decisions: Decision[];
  acceptance: AcceptanceStat[];
  connectors: Connector[];
}
