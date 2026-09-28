"use client";

import { useState } from "react";
import type { DecisionType, Task } from "@/types/os";
import { DECISION_TO_STATE, TASK_STATES } from "@/types/os";
import { jstDateTime } from "@/lib/os/format";
import { AGENT_META, OriginTag, OsCard, SeverityBadge, StateChip, STATE_META } from "./ui";

export type DecisionHandler = (taskId: string, decision: DecisionType, payload: { reasonText?: string; holdUntil?: string }) => Promise<void>;

const DECISION_BUTTONS: { key: DecisionType; label: string; cls: string; needsReason: boolean }[] = [
  { key: "approve", label: "承認", cls: "bg-emerald-600 text-white hover:bg-emerald-700", needsReason: false },
  { key: "modify", label: "修正", cls: "bg-blue-50 text-blue-800 ring-1 ring-blue-200 hover:bg-blue-100", needsReason: true },
  { key: "hold", label: "保留", cls: "bg-orange-50 text-orange-800 ring-1 ring-orange-200 hover:bg-orange-100", needsReason: true },
  { key: "reject", label: "却下", cls: "bg-rose-50 text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100", needsReason: true },
];

const DECISION_LABEL: Record<DecisionType, string> = { approve: "承認", modify: "修正して承認", hold: "保留", reject: "却下" };

const EXEC_LABEL: Record<Task["executionMode"], string> = {
  manual: "人が実行",
  draft: "AIが下書き→人が実行",
  internal: "AIが社内で実行",
  external: "外部送信（要最終確認）",
};

function TaskCard({ task, rank, onDecide }: { task: Task; rank: number; onDecide: DecisionHandler }) {
  const [open, setOpen] = useState<DecisionType | null>(null);
  const [reason, setReason] = useState("");
  const [holdUntil, setHoldUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const agent = AGENT_META[task.agentKey];
  const decidable = task.state === "PROPOSED" || task.state === "DETECTED";

  async function submit(decision: DecisionType) {
    setBusy(true);
    try {
      await onDecide(task.id, decision, { reasonText: reason || undefined, holdUntil: holdUntil || undefined });
      setOpen(null);
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-stone-900/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-orange-200">{rank}</span>
        <StateChip state={task.state} />
        <SeverityBadge severity={task.severity} />
        {task.origin ? <OriginTag origin={task.origin} /> : null}
        <span className="ml-auto text-[11px] text-stone-400">優先度 {task.priorityScore}</span>
      </div>
      <h3 className="mt-2 text-base font-bold leading-snug text-stone-900">{task.title}</h3>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
        <span>
          担当AI：{agent.icon} {agent.label}
        </span>
        {task.viaGrokBot ? <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">Grok Bot経由</span> : null}
        <span>・検知 {jstDateTime(task.detectedAt)}</span>
      </p>

      <div className="mt-3 rounded-xl bg-stone-50 p-3">
        <p className="text-[11px] font-bold text-stone-500">根拠（指標）</p>
        <ul className="mt-1 space-y-1">
          {task.evidence.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-2 text-xs text-stone-700">
              {e.origin ? <OriginTag origin={e.origin} /> : null}
              <span className="font-semibold">{e.metric}</span>
              <span>
                {e.previous !== undefined ? `${e.previous}${e.unit ?? ""} → ` : ""}
                <b>
                  {e.current}
                  {e.unit ?? ""}
                </b>
              </span>
              {typeof e.changeRate === "number" ? <span className={e.changeRate < 0 ? "text-rose-600" : "text-emerald-700"}>({e.changeRate > 0 ? "+" : ""}{e.changeRate}%)</span> : null}
              {e.period ? <span className="text-stone-400">{e.period}</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-5 text-stone-600">
          <b>なぜ今：</b>
          {task.whyNow}
        </p>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-bold text-stone-500">提案内容</p>
        <p className="mt-1 text-sm leading-6 text-stone-800">{task.proposal}</p>
        {task.steps?.length ? (
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-stone-600">
            {task.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : null}
        <p className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-500">
          <span className="rounded bg-stone-100 px-1.5 py-0.5">{EXEC_LABEL[task.executionMode]}</span>
          {task.effort ? <span className="rounded bg-stone-100 px-1.5 py-0.5">工数 {task.effort}</span> : null}
          {task.expectedEffect ? <span className="rounded bg-stone-100 px-1.5 py-0.5">期待効果：{task.expectedEffect}</span> : null}
        </p>
      </div>

      {task.lastDecision ? (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
          社長の判断：<b>{DECISION_LABEL[task.lastDecision.decision]}</b>（{jstDateTime(task.lastDecision.decidedAt)}）
          {task.lastDecision.reasonText ? `「${task.lastDecision.reasonText}」` : ""}
          {task.holdUntil && task.state === "ON_HOLD" ? ` → ${task.holdUntil} に再提案` : ""}
        </p>
      ) : null}

      {decidable ? (
        <div className="mt-3">
          <div className="grid grid-cols-4 gap-2">
            {DECISION_BUTTONS.map((b) => (
              <button
                key={b.key}
                type="button"
                disabled={busy}
                onClick={() => (b.needsReason ? setOpen(open === b.key ? null : b.key) : submit(b.key))}
                className={`min-h-[44px] rounded-xl text-sm font-bold transition disabled:opacity-50 ${b.cls} ${open === b.key ? "ring-2 ring-offset-1" : ""}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          {open ? (
            <div className="mt-2 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <label className="block text-xs font-semibold text-stone-600">
                {open === "modify" ? "修正内容" : open === "hold" ? "保留の理由" : "却下の理由"}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder={open === "reject" ? "例：値引きはしない方針" : open === "hold" ? "例：新メニュー開始後に" : "例：配信日を金曜に変更"}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm"
                />
              </label>
              {open === "hold" ? (
                <label className="block text-xs font-semibold text-stone-600">
                  再提案日
                  <input type="date" value={holdUntil} onChange={(e) => setHoldUntil(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 text-sm" />
                </label>
              ) : null}
              <button
                type="button"
                disabled={busy || (open !== "modify" && !reason.trim())}
                onClick={() => submit(open)}
                className="min-h-[44px] w-full rounded-xl bg-stone-900 text-sm font-bold text-white disabled:opacity-40"
              >
                {DECISION_LABEL[open]}で確定 → {STATE_META[DECISION_TO_STATE[open]].label}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function TodayTasks({ tasks, onDecide }: { tasks: Task[]; onDecide: DecisionHandler }) {
  const pending = tasks.filter((t) => t.state === "PROPOSED").length;
  return (
    <OsCard
      id="today"
      icon="🗂️"
      title="今日の仕事5件（AI経営会議）"
      description="毎朝 06:30 に Manager が各エージェントの発見を統合して選定。承認されたものだけ実行されます。"
      right={<span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">判断待ち {pending}件</span>}
    >
      <div className="-mx-1 mb-3 flex flex-wrap gap-1.5 px-1">
        {TASK_STATES.filter((s) => s !== "SUPERSEDED" && s !== "FAILED").map((s) => (
          <StateChip key={s} state={s} />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {tasks.map((t, i) => (
          <TaskCard key={t.id} task={t} rank={i + 1} onDecide={onDecide} />
        ))}
      </div>
    </OsCard>
  );
}
