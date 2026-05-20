"use client";

import { useState } from "react";
import { AgentLoadingStatus } from "@/components/ootsuki/agent-loading-status";
import type {
  AgentChatResponse,
  SalesAnalysisResult,
  LineProposalResult,
  WeeklyReviewDraftResult,
  RestaurantConsultResult,
  StructuredAgentResult,
} from "@/types/chat";

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
  structured: StructuredAgentResult | null;
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
        structured: null,
      } satisfies AgentResultState,
    ]),
  ) as Record<string, AgentResultState>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-500 hover:bg-stone-50"
    >
      {copied ? "コピー済み" : "コピー"}
    </button>
  );
}

function SalesAnalysisCard({ data }: { data: SalesAnalysisResult }) {
  const copyText = [
    `【サマリー】\n${data.summary}`,
    data.facts.length ? `\n【事実】\n${data.facts.map((f) => `・${f}`).join("\n")}` : "",
    data.hypotheses.length ? `\n【仮説】\n${data.hypotheses.map((h) => `・${h}`).join("\n")}` : "",
    data.nextActions.length ? `\n【次アクション】\n${data.nextActions.map((a) => `・${a}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("");

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-stone-400">分析結果</p>
        <CopyButton text={copyText} />
      </div>
      <div className="rounded-2xl bg-stone-50 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">サマリー</p>
        <p className="mt-2 text-sm leading-7 text-stone-800">{data.summary}</p>
      </div>
      {data.facts.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">事実（数値根拠あり）</p>
          <ul className="mt-2 grid gap-1">
            {data.facts.map((fact, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-emerald-900">
                <span className="mt-0.5 text-emerald-500">✓</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.hypotheses.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">仮説（要検証）</p>
          <ul className="mt-2 grid gap-1">
            {data.hypotheses.map((hyp, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-amber-900">
                <span className="mt-0.5 text-amber-500">?</span>
                {hyp}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.nextActions.length > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">次アクション</p>
          <ol className="mt-2 grid gap-1">
            {data.nextActions.map((action, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-blue-900">
                <span className="mt-0.5 font-semibold text-blue-500">{i + 1}.</span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function LineProposalCard({ data }: { data: LineProposalResult }) {
  const copyText = `【件名】${data.title}\n\n${data.body}\n\n対象: ${data.target}\n目的: ${data.goal}`;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-stone-400">LINE配信案</p>
        <CopyButton text={copyText} />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">件名</p>
        <p className="mt-1 text-base font-semibold text-stone-900">{data.title}</p>
      </div>
      <div className="rounded-2xl bg-stone-50 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">本文</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-800">{data.body}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-stone-100 px-4 py-3">
          <p className="text-xs text-stone-400">想定ターゲット</p>
          <p className="mt-1 text-sm text-stone-800">{data.target}</p>
        </div>
        <div className="rounded-2xl border border-stone-100 px-4 py-3">
          <p className="text-xs text-stone-400">配信目的</p>
          <p className="mt-1 text-sm text-stone-800">{data.goal}</p>
        </div>
      </div>
    </div>
  );
}

function WeeklyReviewCard({ data }: { data: WeeklyReviewDraftResult }) {
  const copyText = [
    data.highlights.length ? `【成果】\n${data.highlights.map((h) => `・${h}`).join("\n")}` : "",
    data.issues.length ? `\n【課題】\n${data.issues.map((i) => `・${i}`).join("\n")}` : "",
    data.actions.length ? `\n【来週やること】\n${data.actions.map((a) => `・${a}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("");

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-stone-400">週次レビュー下書き</p>
        <CopyButton text={copyText} />
      </div>
      {data.highlights.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">成果・良かった点</p>
          <ul className="mt-2 grid gap-1">
            {data.highlights.map((h, i) => (
              <li key={i} className="text-sm leading-6 text-emerald-900">・{h}</li>
            ))}
          </ul>
        </div>
      )}
      {data.issues.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">課題・改善点</p>
          <ul className="mt-2 grid gap-1">
            {data.issues.map((issue, i) => (
              <li key={i} className="text-sm leading-6 text-amber-900">・{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {data.actions.length > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">来週やること</p>
          <ol className="mt-2 grid gap-1">
            {data.actions.map((action, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-blue-900">
                <span className="font-semibold text-blue-500">{i + 1}.</span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function RestaurantConsultCard({ data }: { data: RestaurantConsultResult }) {
  const copyText = [
    `【現状判断】\n${data.currentAssessment}`,
    data.issues.length ? `\n【課題】\n${data.issues.map((i) => `・${i}`).join("\n")}` : "",
    data.improvements.length ? `\n【改善案】\n${data.improvements.map((i) => `・${i}`).join("\n")}` : "",
    data.firstStep ? `\n【最初の一手】\n${data.firstStep}` : "",
  ]
    .filter(Boolean)
    .join("");

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-stone-400">コンサル診断</p>
        <CopyButton text={copyText} />
      </div>
      <div className="rounded-2xl bg-stone-50 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">現状判断</p>
        <p className="mt-2 text-sm leading-7 text-stone-800">{data.currentAssessment}</p>
      </div>
      {data.issues.length > 0 && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">課題</p>
          <ul className="mt-2 grid gap-1">
            {data.issues.map((issue, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-rose-900">
                <span className="mt-0.5 text-rose-400">!</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.improvements.length > 0 && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">改善案（優先順）</p>
          <ol className="mt-2 grid gap-1">
            {data.improvements.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-6 text-emerald-900">
                <span className="font-semibold text-emerald-500">{i + 1}.</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      )}
      {data.firstStep && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">最初の一手</p>
          <p className="mt-2 text-sm font-medium leading-7 text-blue-900">{data.firstStep}</p>
        </div>
      )}
    </div>
  );
}

function StructuredResultCard({ structured }: { structured: StructuredAgentResult }) {
  if (structured.type === "sales-analysis") {
    return <SalesAnalysisCard data={structured.data} />;
  }
  if (structured.type === "line-proposal") {
    return <LineProposalCard data={structured.data} />;
  }
  if (structured.type === "weekly-review") {
    return <WeeklyReviewCard data={structured.data} />;
  }
  if (structured.type === "restaurant-consult") {
    return <RestaurantConsultCard data={structured.data} />;
  }
  return null;
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
          structured: data.structured ?? null,
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

              {state.loading ? (
                <AgentLoadingStatus active={state.loading} agentName={agent.name} />
              ) : null}

              {state.error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
                  {state.error}
                </div>
              ) : null}

              {state.structured ? (
                <div className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-4">
                  <StructuredResultCard structured={state.structured} />
                </div>
              ) : state.reply ? (
                <div className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">回答</p>
                    <CopyButton text={state.reply} />
                  </div>
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
