import { DECISION_TO_STATE, type AgentKey, type Decision, type DecisionType, type OsDashboardData, type TaskEvent, type TaskState } from "@/types/os";

export interface StoredOsDecision {
  id: string;
  taskId: string;
  taskTitle: string;
  agentKey: AgentKey;
  decision: DecisionType;
  reasonText?: string;
  holdUntil?: string;
  fromState: TaskState;
  toState: TaskState;
  decidedBy: string;
  decidedAt: string;
}

const DECISION_BUCKET = {
  approve: "approved",
  modify: "modified",
  hold: "held",
  reject: "rejected",
} as const;

function cloneData(data: OsDashboardData): OsDashboardData {
  return {
    ...data,
    tasks: data.tasks.map((task) => ({ ...task, lastDecision: task.lastDecision ? { ...task.lastDecision } : undefined })),
    timeline: data.timeline.map((event) => ({ ...event })),
    decisions: data.decisions.map((decision) => ({ ...decision })),
    acceptance: data.acceptance.map((stat) => ({ ...stat })),
  };
}

/** 保存済み判断を、画面用データへ新しい順に重ねる。同じタスクは最後の判断が状態になる。 */
export function applyStoredDecisions(data: OsDashboardData, rows: StoredOsDecision[]): OsDashboardData {
  if (rows.length === 0) return data;
  const next = cloneData(data);
  const ordered = [...rows].sort((left, right) => left.decidedAt.localeCompare(right.decidedAt));

  for (const row of ordered) {
    next.tasks = next.tasks.map((task) =>
      task.id === row.taskId
        ? {
            ...task,
            state: row.toState,
            holdUntil: row.decision === "hold" ? row.holdUntil : task.holdUntil,
            lastDecision: { decision: row.decision, reasonText: row.reasonText, decidedAt: row.decidedAt },
          }
        : task,
    );

    const stat = next.acceptance.find((item) => item.agentKey === row.agentKey);
    const bucket = DECISION_BUCKET[row.decision];
    if (stat) {
      stat[bucket] += 1;
    } else {
      next.acceptance.push({
        agentKey: row.agentKey,
        label: row.agentKey,
        approved: bucket === "approved" ? 1 : 0,
        modified: bucket === "modified" ? 1 : 0,
        held: bucket === "held" ? 1 : 0,
        rejected: bucket === "rejected" ? 1 : 0,
      });
    }
  }

  const decisionRows: Decision[] = [...ordered].reverse().map((row) => ({
    id: row.id,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    agentKey: row.agentKey,
    decision: row.decision,
    reasonText: row.reasonText,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
  }));
  const knownDecisionIds = new Set(decisionRows.map((row) => row.id));
  next.decisions = [...decisionRows, ...next.decisions.filter((row) => !knownDecisionIds.has(row.id))];

  const events: TaskEvent[] = [...ordered].reverse().map((row) => ({
    id: `event-${row.id}`,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    fromState: row.fromState,
    toState: row.toState,
    actorType: "user",
    actorLabel: row.decidedBy,
    note: row.reasonText,
    at: row.decidedAt,
  }));
  const knownEventIds = new Set(events.map((event) => event.id));
  next.timeline = [...events, ...next.timeline.filter((event) => !knownEventIds.has(event.id))].slice(0, 20);

  return next;
}

export function nextStateForDecision(decision: DecisionType): TaskState {
  return DECISION_TO_STATE[decision];
}
