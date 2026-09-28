import type { Metric } from "@/types/os";
import { DeltaText, OriginTag, OsCard } from "./ui";

export function MetricTile({ m, compact = false }: { m: Metric; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-stone-900/5 bg-stone-50/80 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-[11px] leading-4 text-stone-500">{m.label}</p>
        <OriginTag origin={m.origin} />
      </div>
      <p className={`mt-1 font-bold tracking-tight text-stone-900 ${compact ? "text-base" : "text-lg md:text-xl"} ${m.origin === "unavailable" ? "text-stone-400" : ""}`}>{m.value}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
        {m.sub ? <span className="text-[10px] text-stone-500">{m.sub}</span> : null}
        <DeltaText delta={m.delta} goodWhen={m.goodWhen} label={m.deltaLabel} />
      </div>
    </div>
  );
}

export function KpiRow({ kpis }: { kpis: Metric[] }) {
  return (
      <OsCard id="kpi" icon="📊" title="KPIサマリー" description="売上・客数・客単価は Grok Bot → Notion 日次。ドリンク比率・原価率・FLは別DB。SEOとアクセスは Notion「検索・アクセス」に週次が入っていれば表示します。口コミ・Instagram・問い合わせ・LINE は未接続のままです。">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {kpis.map((m) => (
          <MetricTile key={m.key} m={m} />
        ))}
      </div>
    </OsCard>
  );
}
