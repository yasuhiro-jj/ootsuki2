"use client";

import { useState } from "react";
import { getMarketingActionDestinations } from "@/lib/marketing/action-service";
import type {
  IntegrationStatus,
  MarketingAction,
  MarketingChannelMetrics,
  MarketingGoal,
  MarketingStore,
} from "@/types/marketing";

interface MarketingCommandCenterProps {
  initialStore: MarketingStore;
  initialGoals: MarketingGoal[];
  initialMetrics: MarketingChannelMetrics[];
  initialActions: MarketingAction[];
  initialIntegrationStatuses: IntegrationStatus[];
  enabled: boolean;
  storeReady: boolean;
}

function formatMetricValue(value?: number, unit?: string) {
  if (typeof value !== "number") return "未取得";
  return `${value.toLocaleString("ja-JP")}${unit || ""}`;
}

function priorityLabel(priority: MarketingAction["priority"]) {
  if (priority === "high") return "HIGH";
  if (priority === "low") return "LOW";
  return "MEDIUM";
}

function approvalLabel(action: MarketingAction) {
  if (action.approvalStatus === "approved") return "承認済み";
  if (action.approvalStatus === "changes_requested") return "修正依頼";
  if (action.approvalStatus === "rejected") return "却下";
  return "承認待ち";
}

function channelLabel(channel: MarketingAction["targetChannel"]) {
  if (channel === "gbp") return "Google";
  if (channel === "canva") return "Canva";
  if (channel === "chatbot") return "チャットボット";
  if (channel === "multi") return "複数チャネル";
  return "Instagram";
}

type ChatbotNodeCandidate = {
  pageId: string;
  pageUrl: string;
  nodeName: string;
  priority?: number;
  keywords: string[];
};

function ChatbotChannelPanel({
  action,
  disabled,
  onApplied,
}: {
  action: MarketingAction;
  disabled: boolean;
  onApplied: (updatedAction: MarketingAction) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ChatbotNodeCandidate[]>([]);
  const [selected, setSelected] = useState<ChatbotNodeCandidate | null>(null);
  const [addKeywords, setAddKeywords] = useState("おすすめ,人気");
  const [newPriority, setNewPriority] = useState("10");
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function searchNodes() {
    if (!query.trim() || searching) return;
    setSearching(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/marketing/chatbot-nodes/search?q=${encodeURIComponent(query.trim())}`);
      const data = (await response.json()) as { ok?: boolean; message?: string; nodes?: ChatbotNodeCandidate[] };
      if (!response.ok || !data.ok) {
        setMessage(data.message || "検索に失敗しました。");
        setCandidates([]);
        return;
      }
      setCandidates(data.nodes || []);
      if (!data.nodes || data.nodes.length === 0) {
        setMessage("一致する会話ノードが見つかりませんでした。");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "検索に失敗しました。");
    } finally {
      setSearching(false);
    }
  }

  async function applyToChatbot() {
    if (!selected || applying) return;
    const priorityValue = Number(newPriority);
    if (!Number.isFinite(priorityValue)) {
      setMessage("優先度は数値で入力してください。");
      return;
    }
    setApplying(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/marketing/actions/${action.id}/apply-chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: selected.pageId,
          newPriority: priorityValue,
          addKeywords: addKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setMessage(data.message || "チャットボットへの反映に失敗しました。");
        return;
      }
      setMessage(`「${selected.nodeName}」の優先度・キーワードを更新しました。`);
      onApplied({ ...action, status: "executed" });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
        チャットボット（ootsuki2）へ反映
      </p>
      <p className="mt-1 text-xs text-violet-800">
        会話ノードを検索して選び、優先度とキーワードを更新します（承認済みの施策のみ実行できます）。
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例: 馬刺し"
          className="flex-1 rounded-xl border border-stone-900/10 bg-white px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void searchNodes()}
          disabled={disabled || searching || !query.trim()}
          className="rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? "検索中…" : "会話ノードを検索"}
        </button>
      </div>

      {candidates.length > 0 ? (
        <div className="mt-2 grid gap-1">
          {candidates.map((node) => (
            <label
              key={node.pageId}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-stone-700"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`chatbot-node-${action.id}`}
                  checked={selected?.pageId === node.pageId}
                  onChange={() => {
                    setSelected(node);
                    setNewPriority(String(node.priority ?? 999));
                  }}
                />
                {node.nodeName}（現在の優先度: {node.priority ?? "未設定"}）
              </span>
              <span className="text-stone-400">{node.keywords.join(", ")}</span>
            </label>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_auto]">
          <input
            value={addKeywords}
            onChange={(event) => setAddKeywords(event.target.value)}
            placeholder="追加キーワード（カンマ区切り）"
            className="rounded-xl border border-stone-900/10 bg-white px-3 py-2 text-sm outline-none"
          />
          <input
            value={newPriority}
            onChange={(event) => setNewPriority(event.target.value)}
            inputMode="numeric"
            placeholder="優先度"
            className="rounded-xl border border-stone-900/10 bg-white px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void applyToChatbot()}
            disabled={disabled || applying}
            className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {applying ? "反映中…" : "チャットボットへ反映"}
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-violet-800">{message}</p> : null}
    </div>
  );
}

function integrationLabel(status: IntegrationStatus) {
  const service =
    status.service === "gbp"
      ? "Google"
      : status.service === "canva"
        ? "Canva"
        : status.service === "chatbot"
          ? "チャットボット"
          : "Instagram";
  const state =
    status.status === "connected"
      ? "接続済み"
      : status.status === "expired"
        ? "期限切れ"
        : status.status === "error"
          ? "エラー"
          : "準備中";
  return `${service} ${state}`;
}

export function MarketingCommandCenter({
  initialStore,
  initialGoals,
  initialMetrics,
  initialActions,
  initialIntegrationStatuses,
  enabled,
  storeReady,
}: MarketingCommandCenterProps) {
  const [store] = useState(initialStore);
  const [goals, setGoals] = useState(initialGoals);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [actions, setActions] = useState(initialActions);
  const [integrationStatuses, setIntegrationStatuses] = useState(initialIntegrationStatuses);
  const [diagnosis, setDiagnosis] = useState("");
  const [loading, setLoading] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalUnit, setGoalUnit] = useState("件");
  // 却下済み・完了済みの施策は既定では隠す。一覧が古い提案で埋まって
  // 「同じようなものがまだある」ように見えるのを防ぐため。
  const [showResolvedActions, setShowResolvedActions] = useState(false);

  async function generateActions() {
    if (!enabled || !storeReady || loading) return;
    setLoading(true);
    setError(null);
    setDiagnosis("");

    try {
      const response = await fetch("/api/marketing/actions", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        diagnosis?: string;
        actions?: MarketingAction[];
        metrics?: MarketingChannelMetrics[];
        goals?: MarketingGoal[];
        integrationStatuses?: IntegrationStatus[];
      };

      if (!response.ok || !data.ok) {
        setError(data.message || "施策生成に失敗しました。");
        return;
      }

      setActions(data.actions || []);
      setMetrics(data.metrics || metrics);
      setGoals(data.goals || goals);
      setIntegrationStatuses(data.integrationStatuses || integrationStatuses);
      setDiagnosis(data.diagnosis || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function saveGoal() {
    if (!goalTitle.trim() || goalSaving || !storeReady) return;
    setGoalSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/marketing/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id,
          title: goalTitle.trim(),
          goalType: "custom",
          targetValue: goalTarget ? Number(goalTarget) : undefined,
          unit: goalUnit,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string; goal?: MarketingGoal };
      if (!response.ok || !data.ok || !data.goal) {
        setError(data.message || "目標の保存に失敗しました。");
        return;
      }
      setGoals((current) => [data.goal!, ...current]);
      setGoalTitle("");
      setGoalTarget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setGoalSaving(false);
    }
  }

  async function updateApproval(actionId: string, approval: "approved" | "changes_requested" | "rejected") {
    if (!storeReady || loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/marketing/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string; action?: MarketingAction };
      if (!response.ok || !data.ok || !data.action) {
        setError(data.message || "承認状態の更新に失敗しました。");
        return;
      }
      setActions((current) => current.map((item) => (item.id === actionId ? data.action! : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function evaluateAction(actionId: string) {
    if (!enabled || !storeReady || loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/marketing/actions/${actionId}/evaluate`, { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        action?: MarketingAction | null;
        metrics?: MarketingChannelMetrics[];
      };

      if (!response.ok || !data.ok || !data.action) {
        setError(data.message || "施策評価に失敗しました。");
        return;
      }

      setActions((current) => current.map((item) => (item.id === actionId ? data.action! : item)));
      setMetrics(data.metrics || metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function startExecution(actionId: string, channel: string, href: string) {
    if (!storeReady || loading) return;
    setLoading(true);
    setError(null);

    try {
      await fetch(`/api/marketing/actions/${actionId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "start", channel }),
      });
      setActions((current) =>
        current.map((item) => (item.id === actionId ? { ...item, status: "in_progress" } : item)),
      );
      window.open(href, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "実行履歴の作成に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function completeExecution(actionId: string) {
    if (!storeReady || loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/marketing/actions/${actionId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "complete" }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        setError(data.message || "投稿完了登録に失敗しました。");
        return;
      }
      setActions((current) =>
        current.map((item) => (item.id === actionId ? { ...item, status: "executed" } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  const activeGoals = goals.filter((goal) => goal.status === "active");
  const resolvedActionsCount = actions.filter(
    (action) => action.approvalStatus === "rejected" || action.status === "completed",
  ).length;
  const visibleActions = showResolvedActions
    ? actions
    : actions.filter((action) => action.approvalStatus !== "rejected" && action.status !== "completed");

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
        <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">店舗</p>
          <p className="mt-2 text-lg font-bold text-stone-900">{store.name}</p>
          <p className="mt-1 break-all text-xs text-stone-500">storeId: {store.id}</p>
          <div className="mt-3 grid gap-1 text-xs text-stone-600">
            <p>Instagram: {store.instagramAccountId || "未設定"}</p>
            <p>GBP: {store.gbpLocationId || "未設定"}</p>
            <p>Canva: {store.canvaBrandId || "未設定"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">API接続状態</p>
          <div className="mt-3 grid gap-2">
            {integrationStatuses.map((item) => (
              <div key={item.service} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
                <span className="text-sm text-stone-700">{integrationLabel(item).split(" ")[0]}</span>
                <span className="text-xs font-medium text-stone-600">{integrationLabel(item).split(" ")[1]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">店舗目標</p>
          <div className="mt-3 grid gap-2">
            {activeGoals.length === 0 ? (
              <p className="text-sm text-stone-600">まだ有効なマーケティング目標はありません。</p>
            ) : (
              activeGoals.slice(0, 3).map((goal) => (
                <div key={goal.id} className="rounded-xl bg-stone-50 px-3 py-3">
                  <p className="text-sm font-semibold text-stone-900">{goal.title}</p>
                  {typeof goal.targetValue === "number" ? (
                    <p className="mt-1 text-xs text-stone-500">
                      目標 {formatMetricValue(goal.targetValue, goal.unit)}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_90px_70px_auto]">
            <input
              value={goalTitle}
              onChange={(event) => setGoalTitle(event.target.value)}
              placeholder="例: 宴会予約を増やす"
              className="rounded-xl border border-stone-900/10 bg-stone-50 px-3 py-2 text-sm outline-none"
            />
            <input
              value={goalTarget}
              onChange={(event) => setGoalTarget(event.target.value)}
              placeholder="20"
              inputMode="numeric"
              className="rounded-xl border border-stone-900/10 bg-stone-50 px-3 py-2 text-sm outline-none"
            />
            <input
              value={goalUnit}
              onChange={(event) => setGoalUnit(event.target.value)}
              className="rounded-xl border border-stone-900/10 bg-stone-50 px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void saveGoal()}
              disabled={!goalTitle.trim() || goalSaving || !storeReady}
              className="rounded-xl bg-stone-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              追加
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {metrics.map((channel) => (
          <div key={channel.channel} className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-900">{channel.label}</p>
                <p className="mt-1 text-xs text-stone-500">{channel.source}</p>
              </div>
              <span className="rounded-full border border-stone-900/10 bg-white px-3 py-1 text-xs text-stone-600">
                {channel.status === "connected" ? "接続準備済み" : "手動/仮指標"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
              <span>最終取得: {new Date(channel.fetchedAt).toLocaleString("ja-JP")}</span>
              {channel.period ? <span>{channel.period.start} - {channel.period.end}</span> : null}
            </div>
            {channel.errorMessage ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {channel.label}データ取得に失敗しました: {channel.errorMessage}
                {channel.lastSuccessfulFetchedAt ? ` / 最終成功取得: ${channel.lastSuccessfulFetchedAt}` : ""}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {channel.metrics.map((item) => (
                <div key={item.key} className="rounded-xl bg-white px-3 py-3">
                  <p className="text-xs text-stone-500">{item.label}</p>
                  <p className="mt-1 text-lg font-bold text-stone-900">
                    {formatMetricValue(item.value, item.unit)}
                  </p>
                  {typeof item.deltaPercent === "number" ? (
                    <p className="mt-1 text-xs text-stone-500">
                      前期間比 {item.deltaPercent >= 0 ? "+" : ""}{item.deltaPercent.toFixed(1)}%
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void generateActions()}
          disabled={!enabled || !storeReady || loading}
          className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "AI診断中..." : "目標と数値からAI施策を生成"}
        </button>
        {!enabled ? <p className="text-sm text-amber-700">OPENAI_API_KEY が未設定です。</p> : null}
        {!storeReady ? <p className="text-sm text-amber-700">DB保存設定またはテーブルが未準備です。</p> : null}
      </div>

      {diagnosis ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm leading-7 text-blue-900">
          <span className="font-semibold">AI判断: </span>
          {diagnosis}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone-600">
          {showResolvedActions
            ? `${actions.length}件を表示中（却下・完了済みを含む）`
            : `${visibleActions.length}件を表示中（却下・完了済み ${resolvedActionsCount}件は非表示）`}
        </p>
        {resolvedActionsCount > 0 ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={showResolvedActions}
              onChange={(event) => setShowResolvedActions(event.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            却下・完了済みも表示する
          </label>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {visibleActions.length === 0 ? (
          <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4 text-sm text-stone-600 md:col-span-2">
            {actions.length === 0
              ? "まだAI施策は保存されていません。店舗目標とInstagram/GBP指標をもとに生成できます。"
              : "表示できる施策がありません（却下・完了済みのみです）。上のチェックを入れると表示されます。"}
          </div>
        ) : (
          visibleActions.map((action) => (
            <article key={action.id} className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-900">{action.title}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {channelLabel(action.targetChannel)} / 優先度 {priorityLabel(action.priority)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{action.status}</span>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                    {approvalLabel(action)}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm leading-6 text-stone-700">
                <p>
                  <span className="font-semibold text-stone-900">理由:</span> {action.reason}
                </p>
                <p>
                  <span className="font-semibold text-stone-900">目的:</span> {action.targetKpi}
                </p>
                <p>
                  <span className="font-semibold text-stone-900">推奨施策:</span> {action.recommendedAction}
                </p>
              </div>

              {action.evidence.length > 0 ? (
                <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">根拠</p>
                  <div className="mt-2 grid gap-2">
                    {action.evidence.map((item, index) => (
                      <div key={`${action.id}-evidence-${index}`} className="text-sm leading-6 text-stone-700">
                        <p className="font-medium text-stone-900">{item.metric}</p>
                        <p>{item.explanation}</p>
                        {typeof item.currentValue === "number" ? (
                          <p className="text-xs text-stone-500">
                            現在 {item.currentValue}
                            {typeof item.previousValue === "number" ? ` / 前回 ${item.previousValue}` : ""}
                            {typeof item.changeRate === "number" ? ` / 変化 ${item.changeRate}%` : ""}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {getMarketingActionDestinations(action, store).map((destination) => (
                  <button
                    type="button"
                    key={destination.key}
                    onClick={() => void startExecution(action.id, destination.key, destination.href)}
                    disabled={loading || action.approvalStatus !== "approved"}
                    className="inline-flex rounded-full border border-stone-900/10 px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
                  >
                    {destination.label}
                  </button>
                ))}
                {action.targetChannel !== "chatbot" ? (
                  <button
                    type="button"
                    onClick={() => void completeExecution(action.id)}
                    disabled={loading || action.status === "executed" || action.status === "completed"}
                    className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    投稿完了として登録
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void evaluateAction(action.id)}
                  disabled={!enabled || !storeReady || loading}
                  className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  投稿後の結果をAI評価
                </button>
              </div>

              {action.targetChannel === "chatbot" ? (
                <ChatbotChannelPanel
                  action={action}
                  disabled={loading || action.approvalStatus !== "approved"}
                  onApplied={(updated) =>
                    setActions((current) => current.map((item) => (item.id === updated.id ? updated : item)))
                  }
                />
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-900/10 pt-3">
                <button
                  type="button"
                  onClick={() => void updateApproval(action.id, "approved")}
                  disabled={loading || action.approvalStatus === "approved"}
                  className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  承認
                </button>
                <button
                  type="button"
                  onClick={() => void updateApproval(action.id, "changes_requested")}
                  disabled={loading}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  修正
                </button>
                <button
                  type="button"
                  onClick={() => void updateApproval(action.id, "rejected")}
                  disabled={loading || action.approvalStatus === "rejected"}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  却下
                </button>
              </div>

              {action.evaluation ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                  {String(action.evaluation.summary || action.evaluation.kpi_result || "評価済み")}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
