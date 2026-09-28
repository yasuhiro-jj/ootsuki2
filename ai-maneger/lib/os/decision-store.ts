import { withTenant } from "@/lib/db";
import { isTenantConfigStoreEnabled } from "@/lib/tenant-config/repository";
import type { AgentKey, DecisionType, TaskState } from "@/types/os";
import type { StoredOsDecision } from "@/lib/os/decisions";

const AGENT_KEYS = new Set<AgentKey>([
  "manager",
  "executive",
  "sales",
  "marketing",
  "acquisition",
  "seo",
  "sns",
  "customer",
  "inventory",
  "finance",
  "operations",
  "data_quality",
]);

const TASK_STATES = new Set<TaskState>([
  "DETECTED",
  "PROPOSED",
  "APPROVED",
  "EXECUTING",
  "COMPLETED",
  "REJECTED",
  "ON_HOLD",
  "SUPERSEDED",
  "FAILED",
]);

const DECISIONS = new Set<DecisionType>(["approve", "modify", "hold", "reject"]);

export class OsDecisionStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OsDecisionStoreError";
  }
}

interface DecisionRow {
  id: string;
  task_id: string;
  task_title: string;
  agent_key: string;
  decision: string;
  reason_text: string | null;
  hold_until: Date | string | null;
  from_state: string;
  to_state: string;
  decided_by: string;
  decided_at: Date | string;
}

function asIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asDateOnly(value: Date | string | null) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function mapRow(row: DecisionRow): StoredOsDecision | null {
  if (!AGENT_KEYS.has(row.agent_key as AgentKey)) return null;
  if (!DECISIONS.has(row.decision as DecisionType)) return null;
  if (!TASK_STATES.has(row.from_state as TaskState) || !TASK_STATES.has(row.to_state as TaskState)) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    agentKey: row.agent_key as AgentKey,
    decision: row.decision as DecisionType,
    reasonText: row.reason_text || undefined,
    holdUntil: asDateOnly(row.hold_until),
    fromState: row.from_state as TaskState,
    toState: row.to_state as TaskState,
    decidedBy: row.decided_by,
    decidedAt: asIso(row.decided_at),
  };
}

function assertStoreEnabled() {
  if (!isTenantConfigStoreEnabled()) {
    throw new OsDecisionStoreError(
      "判断の保存先が無効です。TENANT_CONFIG_STORE_ENABLED=true と、db/migrations/20260928_os_task_decisions.sql の実行が必要です。",
      503,
    );
  }
}

function wrapDbError(error: unknown): never {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "42P01") {
    throw new OsDecisionStoreError(
      "判断テーブルがありません。db/migrations/20260928_os_task_decisions.sql をデータベースで実行してください。",
      503,
    );
  }
  throw error;
}

export async function listOsDecisions(tenantKey: string): Promise<StoredOsDecision[]> {
  if (!isTenantConfigStoreEnabled()) return [];
  try {
    const rows = await withTenant(tenantKey, async (client) => {
      const result = await client.query<DecisionRow>(
        `SELECT id, task_id, task_title, agent_key, decision, reason_text, hold_until, from_state, to_state, decided_by, decided_at
           FROM os_task_decisions
          WHERE tenant_key = $1
          ORDER BY decided_at DESC
          LIMIT 100`,
        [tenantKey],
      );
      return result.rows;
    });
    return rows.map(mapRow).filter((row): row is StoredOsDecision => Boolean(row));
  } catch (error) {
    if (error instanceof OsDecisionStoreError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
    if (code === "42P01") return [];
    throw error;
  }
}

export async function insertOsDecision(
  tenantKey: string,
  input: Omit<StoredOsDecision, "id" | "decidedAt"> & { decidedAt?: string },
): Promise<StoredOsDecision> {
  assertStoreEnabled();
  try {
    const row = await withTenant(tenantKey, async (client) => {
      const result = await client.query<DecisionRow>(
        `INSERT INTO os_task_decisions (
           tenant_key, task_id, task_title, agent_key, decision, reason_text, hold_until, from_state, to_state, decided_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, task_id, task_title, agent_key, decision, reason_text, hold_until, from_state, to_state, decided_by, decided_at`,
        [
          tenantKey,
          input.taskId,
          input.taskTitle,
          input.agentKey,
          input.decision,
          input.reasonText ?? null,
          input.holdUntil ?? null,
          input.fromState,
          input.toState,
          input.decidedBy,
        ],
      );
      return result.rows[0];
    });
    const mapped = row ? mapRow(row) : null;
    if (!mapped) throw new OsDecisionStoreError("判断の保存結果を読めませんでした。", 500);
    return mapped;
  } catch (error) {
    if (error instanceof OsDecisionStoreError) throw error;
    wrapDbError(error);
  }
}
