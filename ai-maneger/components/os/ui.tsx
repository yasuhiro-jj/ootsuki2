import type { ReactNode } from "react";
import type { AgentKey, ConnectorStatus, DataOrigin, Severity, TaskState } from "@/types/os";

/** 既存 components/common/section-card.tsx のトーン（stone / orange、白カード、大きめ角丸）に合わせる */
export function OsCard({
  id,
  title,
  icon,
  description,
  right,
  children,
  className = "",
}: {
  id?: string;
  title?: string;
  icon?: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 rounded-3xl border border-stone-900/10 bg-white/90 p-4 shadow-[0_18px_50px_rgba(120,53,15,0.08)] md:rounded-[28px] md:p-6 ${className}`}
    >
      {title ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight md:text-xl">
              {icon ? <span aria-hidden>{icon}</span> : null}
              <span>{title}</span>
            </h2>
            {description ? <p className="mt-1 text-xs leading-6 text-stone-500 md:text-sm">{description}</p> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

const ORIGIN_TONE: Record<DataOrigin, { label: string; cls: string }> = {
  actual: { label: "実績", cls: "bg-emerald-100 text-emerald-800" },
  derived: { label: "算出", cls: "bg-sky-100 text-sky-800" },
  sample: { label: "サンプル", cls: "bg-stone-200 text-stone-600" },
  unavailable: { label: "未取得", cls: "bg-rose-50 text-rose-600" },
};

export function OriginTag({ origin }: { origin: DataOrigin }) {
  const t = ORIGIN_TONE[origin];
  return <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${t.cls}`}>{t.label}</span>;
}

export const STATE_META: Record<TaskState, { label: string; cls: string }> = {
  DETECTED: { label: "検知", cls: "bg-slate-100 text-slate-700 ring-slate-300" },
  PROPOSED: { label: "提案中", cls: "bg-amber-100 text-amber-800 ring-amber-300" },
  APPROVED: { label: "承認済", cls: "bg-blue-100 text-blue-800 ring-blue-300" },
  EXECUTING: { label: "実行中", cls: "bg-violet-100 text-violet-800 ring-violet-300" },
  COMPLETED: { label: "完了", cls: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  REJECTED: { label: "却下", cls: "bg-rose-100 text-rose-800 ring-rose-300" },
  ON_HOLD: { label: "保留", cls: "bg-orange-100 text-orange-800 ring-orange-300" },
  SUPERSEDED: { label: "置換", cls: "bg-stone-100 text-stone-500 ring-stone-300" },
  FAILED: { label: "失敗", cls: "bg-red-100 text-red-800 ring-red-300" },
};

export function StateChip({ state }: { state: TaskState }) {
  const m = STATE_META[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${m.cls}`}>
      <span className="font-mono text-[9px] opacity-70">{state}</span>
      {m.label}
    </span>
  );
}

export const CONNECTOR_META: Record<ConnectorStatus, { label: string; cls: string; dot: string }> = {
  connected: { label: "接続済", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  grok_bot: { label: "Grok Bot経由", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  manual: { label: "手入力・Notion", cls: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  partial: { label: "一部接続", cls: "bg-yellow-50 text-yellow-800 ring-yellow-200", dot: "bg-yellow-500" },
  error: { label: "エラー", cls: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  not_connected: { label: "未接続", cls: "bg-stone-100 text-stone-600 ring-stone-200", dot: "bg-stone-400" },
  planned: { label: "準備中", cls: "bg-stone-100 text-stone-500 ring-stone-200", dot: "bg-stone-300" },
};

export function ConnectorBadge({ status, phase }: { status: ConnectorStatus; phase?: number }) {
  const m = CONNECTOR_META[status];
  const phaseText = (status === "planned" || status === "not_connected") && phase ? ` Phase ${phase}` : "";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
      {phaseText}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const label = severity >= 5 ? "最重要" : severity === 4 ? "高" : severity === 3 ? "中" : "低";
  const cls =
    severity >= 5
      ? "bg-red-600 text-white"
      : severity === 4
        ? "bg-orange-500 text-white"
        : severity === 3
          ? "bg-amber-200 text-amber-900"
          : "bg-stone-200 text-stone-700";
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${cls}`}>重要度 {label}</span>;
}

export function DeltaText({ delta, goodWhen = "up", label }: { delta?: number; goodWhen?: "up" | "down"; label?: string }) {
  if (typeof delta !== "number") return null;
  const good = goodWhen === "up" ? delta >= 0 : delta <= 0;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "―";
  return (
    <span className={`text-[11px] font-semibold ${good ? "text-emerald-700" : "text-rose-600"}`}>
      {arrow} {Math.abs(delta).toFixed(1)}
      {label?.includes("pt") ? "pt" : "%"}
      {label ? <span className="ml-1 font-normal text-stone-500">{label.replace("pt", "")}</span> : null}
    </span>
  );
}

export const AGENT_META: Record<AgentKey, { label: string; icon: string }> = {
  manager: { label: "Manager", icon: "🧭" },
  executive: { label: "経営", icon: "🏢" },
  sales: { label: "営業（売上）", icon: "🧾" },
  marketing: { label: "マーケ", icon: "📣" },
  acquisition: { label: "集客（MEO）", icon: "📍" },
  seo: { label: "SEO", icon: "🔎" },
  sns: { label: "SNS", icon: "📸" },
  customer: { label: "顧客対応", icon: "💬" },
  inventory: { label: "在庫", icon: "📦" },
  finance: { label: "財務", icon: "💴" },
  operations: { label: "業務改善", icon: "🛠️" },
  data_quality: { label: "データ品質", icon: "🧹" },
};

export function PhasePlaceholder({ title, icon, phase, description, feeds }: { title: string; icon?: string; phase?: number; description?: string; feeds?: string[] }) {
  return (
    <div className="flex h-full min-h-[150px] flex-col rounded-3xl border-2 border-dashed border-stone-300 bg-stone-50/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold text-stone-500">
          {icon ? <span aria-hidden className="grayscale">{icon}</span> : null}
          {title}
        </p>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-stone-200 px-2.5 py-1 text-[11px] font-bold text-stone-600">準備中{phase ? ` Phase ${phase}` : ""}</span>
      </div>
      {description ? <p className="mt-2 text-xs leading-5 text-stone-500">{description}</p> : null}
      {feeds?.length ? (
        <p className="mt-auto pt-3 text-[10px] leading-4 text-stone-400">データ元（予定）：{feeds.join(" / ")}</p>
      ) : null}
    </div>
  );
}
