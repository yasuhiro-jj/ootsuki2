import type { ReactNode } from "react";
import type { OsDashboardData } from "@/types/os";
import { AgentsPanel } from "./agents-panel";
import { ConnectorsPanel } from "./connectors-panel";
import { DecisionsPanel } from "./decisions-panel";
import { DomainPanels } from "./domain-panels";
import { FutureSlots } from "./future-slots";
import { KpiRow } from "./kpi-row";
import { TimelinePanel } from "./timeline-panel";
import { TodayTasks, type DecisionHandler } from "./today-tasks";

/**
 * ページのセクション登録簿。順番・幅・表示有無をここで管理する。
 * 新しいセクションは component を作ってここに1行追加する。
 */
export interface SectionDefinition {
  id: string;
  navLabel: string;
  span: "full" | "half"; // PC幅での横幅（スマホは常に1列）
  enabled: boolean;
  render: (ctx: { data: OsDashboardData; onDecide: DecisionHandler }) => ReactNode;
}

export const SECTION_REGISTRY: SectionDefinition[] = [
  { id: "today", navLabel: "今日の5件", span: "full", enabled: true, render: ({ data, onDecide }) => <TodayTasks tasks={data.tasks} onDecide={onDecide} /> },
  { id: "kpi", navLabel: "KPI", span: "full", enabled: true, render: ({ data }) => <KpiRow kpis={data.kpis} /> },
  { id: "domains", navLabel: "部門別", span: "full", enabled: true, render: ({ data }) => <DomainPanels panels={data.panels} /> },
  { id: "agents", navLabel: "AIエージェント", span: "full", enabled: true, render: ({ data }) => <AgentsPanel agents={data.agents} grokBots={data.grokBots} /> },
  { id: "timeline", navLabel: "実行履歴", span: "half", enabled: true, render: ({ data }) => <TimelinePanel events={data.timeline} tasks={data.tasks} /> },
  { id: "learning", navLabel: "判断・学習", span: "half", enabled: true, render: ({ data }) => <DecisionsPanel decisions={data.decisions} acceptance={data.acceptance} /> },
  { id: "connectors", navLabel: "データ接続", span: "full", enabled: true, render: ({ data }) => <ConnectorsPanel connectors={data.connectors} /> },
  { id: "future", navLabel: "将来枠", span: "full", enabled: true, render: () => <FutureSlots /> },
];
