"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { DecisionType, OsDashboardData, TaskEvent } from "@/types/os";
import { DECISION_TO_STATE } from "@/types/os";
import { DashboardHeader, SampleBanner, SectionNav } from "./dashboard-header";
import { SECTION_REGISTRY } from "./section-registry";
import type { DecisionHandler } from "./today-tasks";

interface OsDashboardProps {
  initialData: OsDashboardData;
  /** 例: "/api/os"。未指定なら画面内だけで状態を変える（プレビュー用） */
  apiBase?: string;
}

export function OsDashboard({ initialData, apiBase }: OsDashboardProps) {
  const [data, setData] = useState(initialData);

  const onDecide: DecisionHandler = useCallback(
    async (taskId: string, decision: DecisionType, payload) => {
      if (apiBase) {
        const res = await fetch(`${apiBase}/tasks/${taskId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, ...payload }),
        });
        if (!res.ok) {
          let message = "判断の保存に失敗しました";
          try {
            const body = (await res.json()) as { message?: string };
            if (typeof body.message === "string" && body.message.trim()) message = body.message;
          } catch {
            // 本文が JSON でないときは既定の文言を出す
          }
          throw new Error(message);
        }
      }
      const now = new Date().toISOString();
      setData((prev) => {
        const task = prev.tasks.find((t) => t.id === taskId);
        if (!task) return prev;
        const toState = DECISION_TO_STATE[decision];
        const event: TaskEvent = {
          id: `local-${now}`,
          taskId,
          taskTitle: task.title,
          fromState: task.state,
          toState,
          actorType: "user",
          actorLabel: "社長",
          note: payload.reasonText,
          at: now,
        };
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId
              ? { ...t, state: toState, holdUntil: payload.holdUntil ?? t.holdUntil, lastDecision: { decision, reasonText: payload.reasonText, decidedAt: now } }
              : t,
          ),
          timeline: [event, ...prev.timeline],
          decisions: [
            { id: `local-d-${now}`, taskId, taskTitle: task.title, agentKey: task.agentKey, decision, reasonText: payload.reasonText, decidedBy: "社長", decidedAt: now },
            ...prev.decisions,
          ],
        };
      });
    },
    [apiBase],
  );

  const sections = SECTION_REGISTRY.filter((s) => s.enabled);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ea_0%,_#fffdf8_40%,_#fff7ed_100%)] text-stone-900" style={{ fontFamily: '"Noto Sans JP","Noto Sans CJK JP","Hiragino Sans",sans-serif' }}>
      {data.isSample ? <SampleBanner /> : null}
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 md:px-8">
        <DashboardHeader data={data} />
        <div className="mt-3">
          <SectionNav items={sections.map((s) => ({ id: s.id, label: s.navLabel }))} />
        </div>
        <main className="mt-3 grid gap-4 lg:grid-cols-2">
          {sections.map((s) => (
            <div key={s.id} className={s.span === "full" ? "lg:col-span-2" : ""}>
              {s.render({ data, onDecide })}
            </div>
          ))}
        </main>
        <footer className="mt-8 text-center text-[11px] text-stone-400">
          AI会社OS ダッシュボード（プロトタイプ）・外部への送信は必ず承認後に人が最終確認
          <div className="mt-2">
            <Link href="/dashboard" className="font-semibold text-orange-700 hover:underline">
              既存ダッシュボードへ戻る
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
