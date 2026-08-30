import { withTenant } from "@/lib/db";
import { isTenantConfigStoreEnabled } from "@/lib/tenant-config/repository";
import type { TenantKey } from "@/lib/tenant-config/types";
import type {
  IntegrationStatus,
  MarketingAction,
  MarketingActionEvidence,
  MarketingActionExecution,
  MarketingActionInput,
  MarketingActionPriority,
  MarketingActionStatus,
  MarketingChannel,
  MarketingChannelMetrics,
  MarketingGoal,
  MarketingGoalInput,
  MarketingGoalStatus,
  MarketingGoalType,
  MarketingStore,
} from "@/types/marketing";

function isMissingTableError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "42P01";
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeChannel(value: unknown): MarketingChannel {
  if (value === "gbp" || value === "canva" || value === "chatbot" || value === "multi") return value;
  return "instagram";
}

function normalizePriority(value: unknown): MarketingActionPriority {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeActionStatus(value: unknown): MarketingActionStatus {
  const valid: MarketingActionStatus[] = [
    "proposed",
    "approved",
    "in_progress",
    "executed",
    "measuring",
    "completed",
    "rejected",
  ];
  return valid.includes(value as MarketingActionStatus) ? (value as MarketingActionStatus) : "proposed";
}

function normalizeGoalType(value: unknown): MarketingGoalType {
  const valid: MarketingGoalType[] = [
    "instagram_reach",
    "instagram_non_follower_reach",
    "gbp_views",
    "gbp_actions",
    "reviews",
    "reservations",
    "line_registrations",
    "sales",
    "custom",
  ];
  return valid.includes(value as MarketingGoalType) ? (value as MarketingGoalType) : "custom";
}

function normalizeGoalStatus(value: unknown): MarketingGoalStatus {
  return value === "completed" || value === "paused" ? value : "active";
}

function normalizeEvidence(value: unknown): MarketingActionEvidence[] {
  return Array.isArray(value) ? (value as MarketingActionEvidence[]) : [];
}

function rowToStore(row: Record<string, unknown>): MarketingStore {
  return {
    id: String(row.id || ""),
    tenantKey: String(row.tenant_key || ""),
    name: String(row.name || ""),
    agencyId: String(row.agency_id || "") || undefined,
    instagramAccountId: String(row.instagram_account_id || "") || undefined,
    gbpLocationId: String(row.gbp_location_id || "") || undefined,
    canvaBrandId: String(row.canva_brand_id || "") || undefined,
    instagramAppUrl: String(row.instagram_app_url || "") || undefined,
    gbpAppUrl: String(row.gbp_app_url || "") || undefined,
    canvaAppUrl: String(row.canva_app_url || "") || undefined,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function rowToGoal(row: Record<string, unknown>): MarketingGoal {
  return {
    id: String(row.id || ""),
    tenantKey: String(row.tenant_key || ""),
    storeId: String(row.store_id || ""),
    title: String(row.title || ""),
    description: String(row.description || "") || undefined,
    goalType: normalizeGoalType(row.goal_type),
    targetValue: toNumber(row.target_value),
    currentValue: toNumber(row.current_value),
    unit: String(row.unit || "") || undefined,
    startDate: String(row.start_date || "") || undefined,
    endDate: String(row.end_date || "") || undefined,
    status: normalizeGoalStatus(row.status),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function rowToMarketingAction(row: Record<string, unknown>): MarketingAction {
  const metricsSnapshot = row.metrics_snapshot;
  const evaluation = row.evaluation;
  return {
    id: String(row.id || ""),
    tenantKey: String(row.tenant_key || ""),
    storeId: String(row.store_id || ""),
    title: String(row.title || ""),
    reason: String(row.reason || ""),
    evidence: normalizeEvidence(row.evidence),
    targetChannel: normalizeChannel(row.target_channel),
    contentTheme: String(row.content_theme || ""),
    priority: normalizePriority(row.priority),
    targetKpi: String(row.target_kpi || ""),
    recommendedAction: String(row.recommended_action || ""),
    status: normalizeActionStatus(row.status),
    approvalStatus: String(row.approval_status || "pending") as MarketingAction["approvalStatus"],
    approvedBy: String(row.approved_by || "") || undefined,
    approvedAt: String(row.approved_at || "") || undefined,
    revisionNote: String(row.revision_note || "") || undefined,
    metricsSnapshot: Array.isArray(metricsSnapshot) ? (metricsSnapshot as MarketingChannelMetrics[]) : [],
    evaluation: typeof evaluation === "object" && evaluation !== null ? (evaluation as Record<string, unknown>) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function rowToExecution(row: Record<string, unknown>): MarketingActionExecution {
  return {
    id: String(row.id || ""),
    tenantKey: String(row.tenant_key || ""),
    actionId: String(row.action_id || ""),
    storeId: String(row.store_id || ""),
    channel: normalizeChannel(row.channel),
    executedAt: String(row.executed_at || "") || undefined,
    externalPostId: String(row.external_post_id || "") || undefined,
    externalUrl: String(row.external_url || "") || undefined,
    metricsBefore:
      typeof row.metrics_before === "object" && row.metrics_before !== null
        ? (row.metrics_before as Record<string, unknown>)
        : undefined,
    metricsAfter:
      typeof row.metrics_after === "object" && row.metrics_after !== null
        ? (row.metrics_after as Record<string, unknown>)
        : undefined,
    resultSummary: String(row.result_summary || "") || undefined,
    aiEvaluation: String(row.ai_evaluation || "") || undefined,
    score: toNumber(row.score),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export function buildFallbackMarketingStore(tenantKey: TenantKey): MarketingStore {
  const now = new Date().toISOString();
  return {
    id: `${tenantKey}-default-store`,
    tenantKey,
    name: tenantKey === "demo" ? "デモ店舗" : "食事処おおつき",
    instagramAppUrl: process.env.NEXT_PUBLIC_INSTAGRAM_APP_URL || "/instagram",
    gbpAppUrl: process.env.NEXT_PUBLIC_GBP_APP_URL || "/google-business-profile",
    canvaAppUrl: process.env.NEXT_PUBLIC_CANVA_APP_URL || "/canva",
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrCreateDefaultMarketingStore(tenantKey: TenantKey): Promise<MarketingStore> {
  if (!isTenantConfigStoreEnabled()) return buildFallbackMarketingStore(tenantKey);

  try {
    return await withTenant(tenantKey, async (client) => {
      const existing = await client.query(
        `SELECT id, tenant_key, name, agency_id, instagram_account_id, gbp_location_id,
                canva_brand_id, instagram_app_url, gbp_app_url, canva_app_url,
                created_at, updated_at
           FROM marketing_stores
          WHERE tenant_key = $1
          ORDER BY created_at ASC
          LIMIT 1`,
        [tenantKey],
      );
      if (existing.rows[0]) return rowToStore(existing.rows[0]);

      const fallback = buildFallbackMarketingStore(tenantKey);
      const inserted = await client.query(
        `INSERT INTO marketing_stores (
          tenant_key, name, instagram_app_url, gbp_app_url, canva_app_url, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id, tenant_key, name, agency_id, instagram_account_id, gbp_location_id,
                  canva_brand_id, instagram_app_url, gbp_app_url, canva_app_url,
                  created_at, updated_at`,
        [tenantKey, fallback.name, fallback.instagramAppUrl, fallback.gbpAppUrl, fallback.canvaAppUrl],
      );
      return rowToStore(inserted.rows[0]);
    });
  } catch (error) {
    if (isMissingTableError(error)) return buildFallbackMarketingStore(tenantKey);
    throw error;
  }
}

export async function listMarketingGoals(tenantKey: TenantKey, storeId?: string): Promise<MarketingGoal[]> {
  if (!isTenantConfigStoreEnabled()) return [];
  try {
    return await withTenant(tenantKey, async (client) => {
      const values: Array<string | number> = [tenantKey];
      const storeClause = storeId ? "AND (store_id = $2 OR store_id IS NULL)" : "";
      if (storeId) values.push(storeId);
      const result = await client.query(
        `SELECT id, tenant_key, store_id, title, description, goal_type, target_value,
                current_value, unit, start_date, end_date, status, created_at, updated_at
           FROM marketing_goals
          WHERE tenant_key = $1 ${storeClause}
          ORDER BY status ASC, created_at DESC`,
        values,
      );
      return result.rows.map(rowToGoal);
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function saveMarketingGoal(tenantKey: TenantKey, input: MarketingGoalInput): Promise<MarketingGoal> {
  if (!isTenantConfigStoreEnabled()) throw new Error("TENANT_CONFIG_STORE_ENABLED=true が必要です");
  const store = input.storeId ? null : await getOrCreateDefaultMarketingStore(tenantKey);
  const storeId = input.storeId || store?.id || "";

  return withTenant(tenantKey, async (client) => {
    const result = await client.query(
      `INSERT INTO marketing_goals (
        tenant_key, store_id, title, description, goal_type, target_value, current_value,
        unit, start_date, end_date, status, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, NOW())
      RETURNING id, tenant_key, store_id, title, description, goal_type, target_value,
                current_value, unit, start_date, end_date, status, created_at, updated_at`,
      [
        tenantKey,
        storeId,
        input.title,
        input.description || "",
        input.goalType,
        input.targetValue ?? null,
        input.currentValue ?? null,
        input.unit || "",
        input.startDate || null,
        input.endDate || null,
        input.status || "active",
      ],
    );
    return rowToGoal(result.rows[0]);
  });
}

export async function listMarketingActions(
  tenantKey: TenantKey,
  limit = 12,
  storeId?: string,
): Promise<MarketingAction[]> {
  if (!isTenantConfigStoreEnabled()) return [];
  try {
    return await withTenant(tenantKey, async (client) => {
      const values: Array<string | number> = [tenantKey];
      const storeClause = storeId ? "AND (store_id = $2 OR store_id IS NULL)" : "";
      if (storeId) values.push(storeId);
      values.push(limit);
      const result = await client.query(
        `SELECT id, tenant_key, store_id, title, reason, evidence, target_channel, content_theme,
                priority, target_kpi, recommended_action, status, approval_status, approved_by,
                approved_at, revision_note, metrics_snapshot, evaluation, created_at, updated_at
           FROM marketing_actions
          WHERE tenant_key = $1 ${storeClause}
          ORDER BY created_at DESC
          LIMIT $${values.length}`,
        values,
      );
      return result.rows.map(rowToMarketingAction);
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function getMarketingActionById(tenantKey: TenantKey, actionId: string): Promise<MarketingAction | null> {
  if (!isTenantConfigStoreEnabled()) return null;
  try {
    return await withTenant(tenantKey, async (client) => {
      const result = await client.query(
        `SELECT id, tenant_key, store_id, title, reason, evidence, target_channel, content_theme,
                priority, target_kpi, recommended_action, status, approval_status, approved_by,
                approved_at, revision_note, metrics_snapshot, evaluation, created_at, updated_at
           FROM marketing_actions
          WHERE tenant_key = $1 AND id = $2
          LIMIT 1`,
        [tenantKey, actionId],
      );
      return result.rows[0] ? rowToMarketingAction(result.rows[0]) : null;
    });
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export async function saveMarketingActions(params: {
  tenantKey: TenantKey;
  storeId?: string;
  actions: MarketingActionInput[];
  metricsSnapshot: MarketingChannelMetrics[];
}): Promise<MarketingAction[]> {
  if (!isTenantConfigStoreEnabled()) {
    throw new Error("TENANT_CONFIG_STORE_ENABLED=true が必要です");
  }

  const store = params.storeId ? null : await getOrCreateDefaultMarketingStore(params.tenantKey);
  const defaultStoreId = params.storeId || store?.id || "";

  return withTenant(params.tenantKey, async (client) => {
    const saved: MarketingAction[] = [];
    for (const action of params.actions) {
      const result = await client.query(
        `INSERT INTO marketing_actions (
          tenant_key, store_id, title, reason, evidence, target_channel, content_theme, priority,
          target_kpi, recommended_action, metrics_snapshot, status, approval_status, updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, 'proposed', 'pending', NOW())
        RETURNING id, tenant_key, store_id, title, reason, evidence, target_channel, content_theme,
                  priority, target_kpi, recommended_action, status, approval_status, approved_by,
                  approved_at, revision_note, metrics_snapshot, evaluation, created_at, updated_at`,
        [
          params.tenantKey,
          action.storeId || defaultStoreId,
          action.title,
          action.reason,
          JSON.stringify(action.evidence || []),
          action.targetChannel,
          action.contentTheme,
          action.priority,
          action.targetKpi,
          action.recommendedAction,
          JSON.stringify(params.metricsSnapshot),
        ],
      );
      saved.push(rowToMarketingAction(result.rows[0]));
    }
    return saved;
  });
}

export async function updateMarketingActionApproval(params: {
  tenantKey: TenantKey;
  actionId: string;
  approval: "approved" | "changes_requested" | "rejected";
  principalId: string;
  revisionNote?: string;
}): Promise<MarketingAction | null> {
  if (!isTenantConfigStoreEnabled()) return null;
  const status: MarketingActionStatus =
    params.approval === "approved" ? "approved" : params.approval === "rejected" ? "rejected" : "proposed";
  return withTenant(params.tenantKey, async (client) => {
    const result = await client.query(
      `UPDATE marketing_actions
          SET approval_status = $3,
              approved_by = CASE WHEN $3 = 'approved' THEN $4 ELSE approved_by END,
              approved_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE approved_at END,
              revision_note = $5,
              status = $6,
              updated_at = NOW()
        WHERE tenant_key = $1 AND id = $2
      RETURNING id, tenant_key, store_id, title, reason, evidence, target_channel, content_theme,
                priority, target_kpi, recommended_action, status, approval_status, approved_by,
                approved_at, revision_note, metrics_snapshot, evaluation, created_at, updated_at`,
      [params.tenantKey, params.actionId, params.approval, params.principalId, params.revisionNote || "", status],
    );
    return result.rows[0] ? rowToMarketingAction(result.rows[0]) : null;
  });
}

export async function saveMarketingActionEvaluation(params: {
  tenantKey: TenantKey;
  actionId: string;
  evaluation: Record<string, unknown>;
  metricsSnapshot: MarketingChannelMetrics[];
}): Promise<MarketingAction | null> {
  if (!isTenantConfigStoreEnabled()) return null;
  return withTenant(params.tenantKey, async (client) => {
    const result = await client.query(
      `UPDATE marketing_actions
          SET evaluation = $3::jsonb,
              metrics_snapshot = $4::jsonb,
              status = 'completed',
              updated_at = NOW()
        WHERE tenant_key = $1 AND id = $2
      RETURNING id, tenant_key, store_id, title, reason, evidence, target_channel, content_theme,
                priority, target_kpi, recommended_action, status, approval_status, approved_by,
                approved_at, revision_note, metrics_snapshot, evaluation, created_at, updated_at`,
      [params.tenantKey, params.actionId, JSON.stringify(params.evaluation), JSON.stringify(params.metricsSnapshot)],
    );
    const action = result.rows[0] ? rowToMarketingAction(result.rows[0]) : null;
    if (action) {
      await client.query(
        `INSERT INTO marketing_action_executions (
          tenant_key, action_id, store_id, channel, metrics_before, metrics_after,
          result_summary, ai_evaluation, score, updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NOW())`,
        [
          params.tenantKey,
          params.actionId,
          action.storeId,
          action.targetChannel,
          JSON.stringify(action.metricsSnapshot),
          JSON.stringify(params.metricsSnapshot),
          String(params.evaluation.summary || ""),
          JSON.stringify(params.evaluation),
          toNumber(params.evaluation.score) ?? null,
        ],
      );
    }
    return action;
  });
}

export async function startMarketingActionExecution(params: {
  tenantKey: TenantKey;
  actionId: string;
  channel: MarketingChannel;
}): Promise<MarketingActionExecution | null> {
  if (!isTenantConfigStoreEnabled()) return null;
  return withTenant(params.tenantKey, async (client) => {
    const actionResult = await client.query(
      `UPDATE marketing_actions
          SET status = 'in_progress',
              updated_at = NOW()
        WHERE tenant_key = $1 AND id = $2
      RETURNING id, store_id, metrics_snapshot`,
      [params.tenantKey, params.actionId],
    );
    const action = actionResult.rows[0];
    if (!action) return null;

    const result = await client.query(
      `INSERT INTO marketing_action_executions (
        tenant_key, action_id, store_id, channel, metrics_before, updated_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      RETURNING id, tenant_key, action_id, store_id, channel, executed_at, external_post_id,
                external_url, metrics_before, metrics_after, result_summary, ai_evaluation,
                score, created_at, updated_at`,
      [
        params.tenantKey,
        params.actionId,
        action.store_id || null,
        params.channel,
        JSON.stringify(action.metrics_snapshot || []),
      ],
    );
    return rowToExecution(result.rows[0]);
  });
}

export async function completeMarketingActionExecution(params: {
  tenantKey: TenantKey;
  actionId: string;
  externalPostId?: string;
  externalUrl?: string;
  executedAt?: string;
}): Promise<MarketingActionExecution | null> {
  if (!isTenantConfigStoreEnabled()) return null;
  return withTenant(params.tenantKey, async (client) => {
    const actionResult = await client.query(
      `UPDATE marketing_actions
          SET status = 'executed',
              updated_at = NOW()
        WHERE tenant_key = $1 AND id = $2
      RETURNING id, store_id, target_channel`,
      [params.tenantKey, params.actionId],
    );
    const action = actionResult.rows[0];
    if (!action) return null;

    const result = await client.query(
      `INSERT INTO marketing_action_executions (
        tenant_key, action_id, store_id, channel, executed_at, external_post_id, external_url, updated_at
      ) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, NOW())
      RETURNING id, tenant_key, action_id, store_id, channel, executed_at, external_post_id,
                external_url, metrics_before, metrics_after, result_summary, ai_evaluation,
                score, created_at, updated_at`,
      [
        params.tenantKey,
        params.actionId,
        action.store_id || null,
        normalizeChannel(action.target_channel),
        params.executedAt || null,
        params.externalPostId || "",
        params.externalUrl || "",
      ],
    );
    return rowToExecution(result.rows[0]);
  });
}

export async function completeChatbotMarketingActionExecution(params: {
  tenantKey: TenantKey;
  actionId: string;
  externalUrl: string;
  resultSummary: string;
  metricsBefore: Record<string, unknown>;
  metricsAfter: Record<string, unknown>;
}): Promise<MarketingActionExecution | null> {
  if (!isTenantConfigStoreEnabled()) return null;
  return withTenant(params.tenantKey, async (client) => {
    const actionResult = await client.query(
      `UPDATE marketing_actions
          SET status = 'executed',
              updated_at = NOW()
        WHERE tenant_key = $1 AND id = $2
      RETURNING id, store_id, target_channel`,
      [params.tenantKey, params.actionId],
    );
    const action = actionResult.rows[0];
    if (!action) return null;

    const result = await client.query(
      `INSERT INTO marketing_action_executions (
        tenant_key, action_id, store_id, channel, executed_at, external_url,
        metrics_before, metrics_after, result_summary, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6::jsonb, $7::jsonb, $8, NOW())
      RETURNING id, tenant_key, action_id, store_id, channel, executed_at, external_post_id,
                external_url, metrics_before, metrics_after, result_summary, ai_evaluation,
                score, created_at, updated_at`,
      [
        params.tenantKey,
        params.actionId,
        action.store_id || null,
        normalizeChannel(action.target_channel),
        params.externalUrl,
        JSON.stringify(params.metricsBefore),
        JSON.stringify(params.metricsAfter),
        params.resultSummary,
      ],
    );
    return rowToExecution(result.rows[0]);
  });
}

export async function listMarketingExecutions(tenantKey: TenantKey, storeId?: string): Promise<MarketingActionExecution[]> {
  if (!isTenantConfigStoreEnabled()) return [];
  try {
    return await withTenant(tenantKey, async (client) => {
      const values: Array<string | number> = [tenantKey];
      const storeClause = storeId ? "AND (store_id = $2 OR store_id IS NULL)" : "";
      if (storeId) values.push(storeId);
      const result = await client.query(
        `SELECT id, tenant_key, action_id, store_id, channel, executed_at, external_post_id,
                external_url, metrics_before, metrics_after, result_summary, ai_evaluation,
                score, created_at, updated_at
           FROM marketing_action_executions
          WHERE tenant_key = $1 ${storeClause}
          ORDER BY created_at DESC
          LIMIT 20`,
        values,
      );
      return result.rows.map(rowToExecution);
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

export async function upsertIntegrationStatuses(
  tenantKey: TenantKey,
  storeId: string,
  statuses: IntegrationStatus[],
) {
  if (!isTenantConfigStoreEnabled()) return;
  await withTenant(tenantKey, async (client) => {
    for (const item of statuses) {
      await client.query(
        `INSERT INTO marketing_integration_statuses (
          tenant_key, store_id, service, status, last_checked_at, error_message, updated_at
        ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6, NOW())
        ON CONFLICT (tenant_key, store_id, service) DO UPDATE SET
          status = EXCLUDED.status,
          last_checked_at = EXCLUDED.last_checked_at,
          error_message = EXCLUDED.error_message,
          updated_at = NOW()`,
        [tenantKey, storeId, item.service, item.status, item.lastCheckedAt || null, item.errorMessage || ""],
      );
    }
  });
}
