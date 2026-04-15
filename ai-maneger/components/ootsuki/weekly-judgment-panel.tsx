"use client";

import { useState } from "react";
import type { AgentChatResponse } from "@/types/chat";

interface WeeklyJudgmentPanelProps {
  weekStart: string;
  weekEnd: string;
  enabled: boolean;
  initialMaterial: {
    title?: string;
    summary?: string;
    relatedNumbers?: string;
    nextAction?: string;
  } | null;
  sourceLabel: string;
  updatedAtLabel: string;
}

type JudgmentDraft = {
  title: string;
  summary: string;
  relatedNumbers: string;
  nextAction: string;
};

function buildEmptyDraft(): JudgmentDraft {
  return {
    title: "",
    summary: "",
    relatedNumbers: "",
    nextAction: "",
  };
}

function parseAgentSuggestion(reply: string): Partial<JudgmentDraft> {
  try {
    const parsed = JSON.parse(reply) as Record<string, unknown>;
    return {
      title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      relatedNumbers:
        typeof parsed.relatedNumbers === "string" ? parsed.relatedNumbers.trim() : "",
      nextAction: typeof parsed.nextAction === "string" ? parsed.nextAction.trim() : "",
    };
  } catch {
    return {
      summary: reply.trim(),
    };
  }
}

export function WeeklyJudgmentPanel({
  weekStart,
  weekEnd,
  enabled,
  initialMaterial,
  sourceLabel,
  updatedAtLabel,
}: WeeklyJudgmentPanelProps) {
  const [prompt, setPrompt] = useState(
    "今週の数字・日次入力・判断メモ・週次レビューを前提に、今週の判断材料を作ってください。",
  );
  const [draft, setDraft] = useState<JudgmentDraft>(() => buildEmptyDraft());
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateDraft(key: keyof JudgmentDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function requestSuggestion() {
    if (!enabled || loading) return;

    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${prompt.trim()}

対象週: ${weekStart}〜${weekEnd}

次の JSON 形式だけで返答してください:
{"title":"...","summary":"...","relatedNumbers":"...","nextAction":"..."}`,
          agentName: "今週の判断材料アナリスト",
          agentRole:
            "ダッシュボード情報を根拠に、現場で使える判断材料を要点・関連数字・次アクションで整理する。",
        }),
      });
      const data = (await response.json()) as AgentChatResponse;
      if (!data.ok) {
        setError(data.message || "提案取得に失敗しました。");
        return;
      }

      const suggestion = parseAgentSuggestion(data.reply);
      setDraft((current) => ({
        title: suggestion.title || current.title,
        summary: suggestion.summary || current.summary,
        relatedNumbers: suggestion.relatedNumbers || current.relatedNumbers,
        nextAction: suggestion.nextAction || current.nextAction,
      }));
      setStatus("エージェント提案を下書きに反映しました。必要に応じて編集してください。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 text-sm text-stone-700">
      <div className="rounded-2xl border border-stone-900/10 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">{sourceLabel}</p>
          <p className="text-xs text-stone-500">更新: {updatedAtLabel}</p>
        </div>
        <p className="mt-2 text-base font-semibold text-stone-900">
          {initialMaterial?.title || "まだ判断材料はありません。"}
        </p>
        <p className="mt-3 leading-7">
          {initialMaterial?.summary || "要点はまだ登録されていません。"}
        </p>
      </div>

      <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
        <p className="font-semibold text-stone-900">エージェント提案で下書きを更新</p>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          ボタンを押すと、要点・関連数字・次アクションを提案して下書きへ反映します。
        </p>
        <textarea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={!enabled || loading}
          className="mt-3 w-full rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm leading-7 outline-none"
        />
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void requestSuggestion()}
            disabled={!enabled || loading}
            className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "提案作成中..." : "今週の判断材料を提案してもらう"}
          </button>
        </div>
        {!enabled ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            `OPENAI_API_KEY` が未設定のため、エージェント提案はまだ使えません。
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
        <p className="font-semibold text-stone-900">確認用下書き（必要ならコピペ利用）</p>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-stone-500">タイトル</span>
            <input
              aria-label="判断材料タイトル"
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-stone-500">要点</span>
            <textarea
              aria-label="判断材料要点"
              rows={4}
              value={draft.summary}
              onChange={(event) => updateDraft("summary", event.target.value)}
              className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm leading-7 outline-none"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-stone-500">関連数字</span>
            <textarea
              aria-label="判断材料関連数字"
              rows={3}
              value={draft.relatedNumbers}
              onChange={(event) => updateDraft("relatedNumbers", event.target.value)}
              className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm leading-7 outline-none"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-stone-500">次アクション</span>
            <textarea
              aria-label="判断材料次アクション"
              rows={3}
              value={draft.nextAction}
              onChange={(event) => updateDraft("nextAction", event.target.value)}
              className="rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm leading-7 outline-none"
            />
          </label>
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
