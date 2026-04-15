"use client";

import { useMemo, useState } from "react";
import type { AgentChatResponse } from "@/types/chat";
import type { WeeklyActionPlan } from "@/types/ootsuki";

function parseActionLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*・]\s*/, "").replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function toEditableText(actions: string[]) {
  return actions.map((action) => `- ${action}`).join("\n");
}

interface WeeklyActionsPanelProps {
  initialPlan: WeeklyActionPlan | null;
  weekStart: string;
  weekEnd: string;
  enabled: boolean;
  configReady: boolean;
}

export function WeeklyActionsPanel({
  initialPlan,
  weekStart,
  weekEnd,
  enabled,
  configReady,
}: WeeklyActionsPanelProps) {
  const [currentPlan, setCurrentPlan] = useState<WeeklyActionPlan | null>(initialPlan);
  const [prompt, setPrompt] = useState(
    "今週の数字、最新メモ、週次レビューを前提に、今週の実行項目を5件以内で優先順に提案してください。各項目はそのまま現場で動ける粒度にしてください。",
  );
  const [draftText, setDraftText] = useState(initialPlan ? toEditableText(initialPlan.actions) : "");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const draftActions = useMemo(() => parseActionLines(draftText), [draftText]);

  async function requestSuggestion() {
    if (!enabled || loadingSuggestion) return;

    setError(null);
    setStatus(null);
    setLoadingSuggestion(true);

    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${prompt.trim()}\n\n対象週: ${weekStart}〜${weekEnd}`,
          agentName: "今週の実行項目プランナー",
          agentRole: "ダッシュボード情報をもとに、今週やるべき実行項目を優先順で提案する。",
        }),
      });
      const data = (await response.json()) as AgentChatResponse;
      if (!data.ok) {
        setError(data.message || "提案取得に失敗しました。");
        return;
      }

      setDraftText(data.reply);
      setStatus("エージェント提案を下書きに反映しました。内容を確認してから保存してください。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setLoadingSuggestion(false);
    }
  }

  async function saveDraft() {
    if (!configReady || saving || draftActions.length === 0) return;

    setError(null);
    setStatus(null);
    setSaving(true);

    try {
      const response = await fetch("/api/weekly-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          weekEnd,
          actions: draftActions,
          source: "ダッシュボードAI提案",
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        plan?: WeeklyActionPlan | null;
      };

      if (!response.ok || !data.ok) {
        setError(data.message || "保存に失敗しました。");
        return;
      }

      setCurrentPlan(data.plan || null);
      if (data.plan) {
        setDraftText(toEditableText(data.plan.actions));
      }
      setStatus("今週の実行項目を Notion に保存しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      {!configReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          `NOTION_OOTSUKI_WEEKLY_ACTIONS_DB_ID` が未設定のため、まだ Notion 保存できません。
        </div>
      ) : null}

      <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold text-stone-900">保存済みの今週の実行項目</p>
          <p className="text-xs text-stone-500">{weekStart} 〜 {weekEnd}</p>
        </div>
        {currentPlan?.actions.length ? (
          <div className="mt-3 grid gap-2">
            {currentPlan.actions.map((action) => (
              <label
                key={action}
                className="flex items-center gap-3 rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-700"
              >
                <input type="checkbox" className="h-4 w-4" />
                {action}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-600">まだ今週の実行項目は保存されていません。</p>
        )}
      </div>

      <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
        <p className="font-semibold text-stone-900">エージェントに相談して下書きを作る</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          今週の数字、判断メモ、週次レビューを前提に提案を作ります。保存前に内容を確認してください。
        </p>
        <textarea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={!enabled || loadingSuggestion}
          className="mt-3 w-full rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm leading-7 outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void requestSuggestion()}
            disabled={!enabled || loadingSuggestion}
            className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingSuggestion ? "提案作成中..." : "今週の実行項目を提案してもらう"}
          </button>
        </div>
        {!enabled ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            `OPENAI_API_KEY` が未設定のため、エージェント提案はまだ使えません。
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
        <p className="font-semibold text-stone-900">保存前の確認用下書き</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          1行につき1項目で編集してください。保存すると今週分を上書きします。
        </p>
        <textarea
          rows={8}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          className="mt-3 w-full rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm leading-7 outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={!configReady || saving || draftActions.length === 0}
            className="inline-flex rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中..." : "確認して Notion に保存"}
          </button>
        </div>
      </div>

      {status ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          {status}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}
