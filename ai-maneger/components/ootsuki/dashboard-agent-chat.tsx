"use client";

import { useCallback, useState } from "react";
import type { AgentChatResponse } from "@/types/chat";

type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `msg-${Date.now()}-${idCounter}`;
}

const presetPrompts = [
  {
    label: "統合レポート",
    agentName: "統括責任者",
    agentRole: "全エージェントの視点をまとめ、Notionデータから読み取れる内容を経営向けレポートとして整理する。",
    message:
      "Notionデータとダッシュボード情報を前提に、全エージェントの観点を統合した週次レポートを作成してください。出力は `現状整理` `読み取れる示唆` `優先課題` `次アクション` の順でまとめてください。",
  },
  {
    label: "改善提案",
    agentName: "統括責任者",
    agentRole: "全エージェントの視点をまとめ、改善優先順位を提案する。",
    message:
      "Notionデータから読み取れる内容だけを根拠に、改善提案を優先順位つきで整理してください。出力は `最優先` `次点` `保留` の3段階でお願いします。",
  },
];

export function DashboardAgentChat({ enabled }: { enabled: boolean }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatBubble[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "ダッシュボード上の数字、判断メモ、週次レビューを前提に相談を受けます。今日の打ち手、優先順位、レビュー文面の整理などをそのまま聞けます。",
    },
  ]);

  const send = useCallback(
    async (options?: { message?: string; agentName?: string; agentRole?: string }) => {
      const text = (options?.message ?? input).trim();
      if (!text || loading || !enabled) return;

      setError(null);
      setLoading(true);
      setMessages((prev) => [...prev, { id: nextId(), role: "user", content: text }]);
      if (!options?.message) {
        setInput("");
      }

      try {
        const response = await fetch("/api/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            ...(options?.agentName ? { agentName: options.agentName } : {}),
            ...(options?.agentRole ? { agentRole: options.agentRole } : {}),
            ...(sessionId ? { sessionId } : {}),
          }),
        });
        const data = (await response.json()) as AgentChatResponse;

        if (!data.ok) {
          setError(data.message || "エージェントの応答取得に失敗しました。");
          return;
        }

        setSessionId(data.sessionId);
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.reply }]);
      } catch (error) {
        setError(error instanceof Error ? error.message : "通信に失敗しました。");
      } finally {
        setLoading(false);
      }
    },
    [enabled, input, loading, sessionId],
  );

  return (
    <div className="overflow-hidden rounded-[24px] border border-stone-900/10 bg-stone-50">
      {!enabled ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          `OPENAI_API_KEY` が未設定のため、送信はまだできません。.env.local に追加してください。
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      <div className="max-h-[480px] overflow-y-auto px-4 py-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {presetPrompts.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() =>
                void send({
                  message: preset.message,
                  agentName: preset.agentName,
                  agentRole: preset.agentRole,
                })
              }
              disabled={!enabled || loading}
              className="rounded-full border border-stone-900/10 bg-white px-4 py-2 text-xs font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preset.label}を作成
            </button>
          ))}
        </div>
        <div className="grid gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                  message.role === "user"
                    ? "bg-stone-900 text-white"
                    : "border border-stone-900/10 bg-white text-stone-800"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-500">
                回答を作成中...
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="border-t border-stone-900/10 bg-white px-4 py-4">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder="例: 今週の数字だと、明日いちばん先に何をやるべき？"
            disabled={!enabled || loading}
            className="min-h-[84px] flex-1 rounded-[20px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!enabled || loading || !input.trim()}
            className="inline-flex h-fit rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
