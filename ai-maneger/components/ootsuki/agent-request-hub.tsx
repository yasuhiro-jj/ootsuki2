"use client";

import { useState } from "react";
import type { AgentChatResponse } from "@/types/chat";

interface AgentDefinition {
  name: string;
  role: string;
}

interface AgentRequestHubProps {
  enabled: boolean;
  agents: AgentDefinition[];
}

interface AgentResultState {
  prompt: string;
  reply: string;
  loading: boolean;
  error: string | null;
  sessionId: string | null;
}

function buildInitialState(agents: AgentDefinition[]) {
  return Object.fromEntries(
    agents.map((agent) => [
      agent.name,
      {
        prompt: "",
        reply: "",
        loading: false,
        error: null,
        sessionId: null,
      } satisfies AgentResultState,
    ]),
  ) as Record<string, AgentResultState>;
}

export function AgentRequestHub({ enabled, agents }: AgentRequestHubProps) {
  const [states, setStates] = useState<Record<string, AgentResultState>>(() =>
    buildInitialState(agents),
  );

  async function submitAgentRequest(agent: AgentDefinition) {
    const current = states[agent.name];
    const message = current?.prompt.trim() ?? "";
    if (!enabled || !message || current.loading) return;

    setStates((previous) => ({
      ...previous,
      [agent.name]: {
        ...previous[agent.name],
        loading: true,
        error: null,
      },
    }));

    try {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          agentName: agent.name,
          agentRole: agent.role,
          ...(current.sessionId ? { sessionId: current.sessionId } : {}),
        }),
      });
      const data = (await response.json()) as AgentChatResponse;

      if (!data.ok) {
        setStates((previous) => ({
          ...previous,
          [agent.name]: {
            ...previous[agent.name],
            loading: false,
            error: data.message || "回答取得に失敗しました。",
          },
        }));
        return;
      }

      setStates((previous) => ({
        ...previous,
        [agent.name]: {
          ...previous[agent.name],
          loading: false,
          reply: data.reply,
          sessionId: data.sessionId,
        },
      }));
    } catch (error) {
      setStates((previous) => ({
        ...previous,
        [agent.name]: {
          ...previous[agent.name],
          loading: false,
          error: error instanceof Error ? error.message : "通信に失敗しました。",
        },
      }));
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {agents.map((agent) => {
        const state = states[agent.name];
        return (
          <article
            key={agent.name}
            className="rounded-[24px] border border-stone-900/10 bg-stone-50/70 px-5 py-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-stone-900">{agent.name}</p>
                <p className="mt-1 text-sm leading-7 text-stone-600">{agent.role}</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-500 shadow-sm">
                依頼して回答取得
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              <textarea
                rows={5}
                value={state.prompt}
                onChange={(event) =>
                  setStates((previous) => ({
                    ...previous,
                    [agent.name]: {
                      ...previous[agent.name],
                      prompt: event.target.value,
                    },
                  }))
                }
                placeholder="例: 今週の数字と最新メモを前提に、改善ポイントを3点に整理してレポート化して"
                disabled={!enabled || state.loading}
                className="w-full rounded-[24px] border border-stone-900/10 bg-white px-4 py-4 text-sm leading-7 text-stone-700 outline-none"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void submitAgentRequest(agent)}
                  disabled={!enabled || state.loading || !state.prompt.trim()}
                  className="inline-flex h-fit rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state.loading ? "回答作成中..." : "このエージェントに依頼"}
                </button>
              </div>

              {!enabled ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  `OPENAI_API_KEY` が未設定のため、まだ送信できません。
                </div>
              ) : null}

              {state.error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
                  {state.error}
                </div>
              ) : null}

              {state.reply ? (
                <div className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-stone-400">回答</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                    {state.reply}
                  </p>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
