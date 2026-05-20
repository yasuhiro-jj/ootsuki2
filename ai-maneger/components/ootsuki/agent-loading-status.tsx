"use client";

import { useEffect, useState } from "react";

const SALES_ANALYST_ESTIMATE_SEC = 90;
const DEFAULT_ESTIMATE_SEC = 45;

const LOADING_STAGES = [
  { after: 0, message: "Notion DBを参照しています…" },
  { after: 3, message: "売上データを集計しています…" },
  { after: 10, message: "昨対比を計算しています…" },
  { after: 20, message: "AIがレポートを作成しています…" },
  { after: 35, message: "もうしばらくお待ちください…" },
  { after: 55, message: "詳細な表を整形しています…" },
  { after: 75, message: "あと少しで完了します…" },
];

function resolveEstimateSeconds(agentName?: string) {
  if (agentName?.includes("売上分析")) return SALES_ANALYST_ESTIMATE_SEC;
  return DEFAULT_ESTIMATE_SEC;
}

function resolveStageMessage(elapsed: number) {
  let message = LOADING_STAGES[0].message;
  for (const stage of LOADING_STAGES) {
    if (elapsed >= stage.after) message = stage.message;
  }
  return message;
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}秒`;
  return `${minutes}分${rest.toString().padStart(2, "0")}秒`;
}

interface AgentLoadingStatusProps {
  active: boolean;
  agentName?: string;
}

export function AgentLoadingStatus({ active, agentName }: AgentLoadingStatusProps) {
  const [elapsed, setElapsed] = useState(0);
  const estimate = resolveEstimateSeconds(agentName);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const remaining = Math.max(0, estimate - elapsed);
  const overtime = elapsed > estimate;
  const progress = overtime ? 95 : Math.min(95, Math.round((elapsed / estimate) * 100));

  return (
    <div
      className="rounded-[24px] border border-teal-200 bg-teal-50/90 px-4 py-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-teal-900">{resolveStageMessage(elapsed)}</p>
          <p className="mt-1 text-xs leading-6 text-teal-800/80">
            {agentName?.includes("売上分析")
              ? "昨対比レポートはNotion DBの取得とAI分析のため、通常30〜90秒ほどかかります。"
              : "Notion DBの参照とAI分析のため、通常30〜60秒ほどかかることがあります。"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-teal-800">
            <span>経過: {formatElapsed(elapsed)}</span>
            {overtime ? (
              <span className="font-medium text-amber-800">
                通常より時間がかかっています。このままお待ちください…
              </span>
            ) : (
              <span>目安: 残り約 {remaining} 秒</span>
            )}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-teal-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-[width] duration-1000 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
