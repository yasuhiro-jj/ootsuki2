"use client";

import { useState } from "react";
import type { AgentChatResponse } from "@/types/chat";

interface LineCopyCardProps {
  title: string;
  body: string;
  enabled?: boolean;
}

function parseLineSuggestion(reply: string) {
  try {
    const parsed = JSON.parse(reply) as Record<string, unknown>;
    return {
      title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      body: typeof parsed.body === "string" ? parsed.body.trim() : reply.trim(),
    };
  } catch {
    return {
      title: "",
      body: reply.trim(),
    };
  }
}

export function LineCopyCard({ title, body, enabled = false }: LineCopyCardProps) {
  const [prompt, setPrompt] = useState(
    "今週の数字、判断材料、最新レビューを前提に、今週末のLINE配信文を1本提案してください。来店につながる内容で、すぐ配信できる文面にしてください。",
  );
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

次の JSON 形式だけで返答してください:
{"title":"...","body":"..."}`,
          agentName: "LINE配信プランナー",
          agentRole:
            "ダッシュボード情報を前提に、すぐ配信できるLINE文面を提案する。タイトルと本文を分けて返す。",
        }),
      });
      const data = (await response.json()) as AgentChatResponse;
      if (!data.ok) {
        setError(data.message || "提案取得に失敗しました。");
        return;
      }

      const suggestion = parseLineSuggestion(data.reply);
      if (suggestion.title) {
        setDraftTitle(suggestion.title);
      }
      setDraftBody(suggestion.body);
      setStatus("エージェント提案を下書きに反映しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`${draftTitle}\n${draftBody}`.trim());
      setError(null);
      setStatus("LINE文面をクリップボードにコピーしました。");
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "コピーに失敗しました。");
    }
  }

  return (
    <div className="grid gap-4 rounded-[28px] border border-orange-200 bg-orange-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-700">LINE配信</p>
          <h3 className="mt-2 text-xl font-bold text-stone-900">{title}</h3>
        </div>
        <div className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white">
          現在の配信文
        </div>
      </div>

      <textarea
        readOnly
        value={body}
        rows={8}
        className="w-full rounded-[24px] border border-stone-900/10 bg-white px-4 py-4 text-sm leading-7 text-stone-700 outline-none"
      />

      <div className="rounded-[24px] border border-orange-200 bg-white/70 px-4 py-4">
        <p className="font-semibold text-stone-900">エージェント提案で下書きを更新</p>
        <textarea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={!enabled || loading}
          className="mt-3 w-full rounded-[20px] border border-stone-900/10 bg-white px-4 py-3 text-sm leading-7 outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void requestSuggestion()}
            disabled={!enabled || loading}
            className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "提案作成中..." : "今週末のLINE配信文を提案してもらう"}
          </button>
          <button
            type="button"
            onClick={() => void copyDraft()}
            className="inline-flex rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-700"
          >
            下書きをコピー
          </button>
        </div>
        {!enabled ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            `OPENAI_API_KEY` が未設定のため、エージェント提案はまだ使えません。
          </div>
        ) : null}
      </div>

      <div className="rounded-[24px] border border-orange-200 bg-white px-4 py-4">
        <p className="font-semibold text-stone-900">確認用下書き</p>
        <div className="mt-3 grid gap-3">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="rounded-2xl border border-stone-900/10 bg-orange-50 px-4 py-3 text-sm outline-none"
          />
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            rows={8}
            className="w-full rounded-[24px] border border-stone-900/10 bg-orange-50 px-4 py-4 text-sm leading-7 text-stone-700 outline-none"
          />
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
