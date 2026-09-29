import type { DomainPanel } from "@/types/os";
import { sortedPanels, type PanelDefinition } from "@/lib/os/panel-registry";
import { jstDateTime } from "@/lib/os/format";
import { MetricTile } from "./kpi-row";
import { ConnectorBadge, OriginTag, OsCard, PhasePlaceholder, SeverityBadge } from "./ui";

function PanelCard({ def, panel }: { def: PanelDefinition; panel: DomainPanel }) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-stone-900/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-stone-900">
          <span aria-hidden>{def.icon}</span>
          {def.title}
        </h3>
        <ConnectorBadge status={panel.status} phase={def.phase} />
      </div>
      {panel.statusNote ? <p className="mt-1 text-[11px] text-stone-500">{panel.statusNote}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {panel.metrics.map((m) => (
          <MetricTile key={m.key} m={m} compact />
        ))}
      </div>
      {panel.lineScenario ? (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-stone-900/5 bg-stone-50/50 p-2">
          <p className="text-[11px] font-bold text-stone-600">
            シナリオ分析 · {panel.lineScenario.scenarioName}
          </p>
          <table className="mt-1 w-full min-w-[280px] text-[10px] text-stone-700">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">ステップ</th>
                <th className="py-1 pr-2">送信済</th>
                <th className="py-1 pr-2">クリック率</th>
                <th className="py-1">ブロック</th>
              </tr>
            </thead>
            <tbody>
              {panel.lineScenario.steps.map((step) => (
                <tr key={step.stepNumber} className="border-t border-stone-200/80">
                  <td className="py-1 pr-2 font-mono">{step.stepNumber}</td>
                  <td className="py-1 pr-2">{step.stepName}</td>
                  <td className="py-1 pr-2">{step.sent !== null ? step.sent.toLocaleString("ja-JP") : "—"}</td>
                  <td className="py-1 pr-2">{step.clickRate !== null ? `${step.clickRate.toFixed(1)}%` : "—"}</td>
                  <td className="py-1">{step.blocks !== null ? step.blocks.toLocaleString("ja-JP") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-3 flex-1">
        <p className="text-[11px] font-bold text-stone-500">最新の発見</p>
        {panel.findings.length ? (
          <ul className="mt-1 space-y-1.5">
            {panel.findings.map((f) => (
              <li key={f.id} className="flex items-start gap-2 rounded-xl bg-orange-50/70 px-2.5 py-2 text-xs text-stone-800">
                <SeverityBadge severity={f.severity} />
                <span className="flex-1 leading-5">{f.title}</span>
                {f.origin ? <OriginTag origin={f.origin} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-stone-400">異常なし</p>
        )}
      </div>
      {panel.updatedAt ? <p className="mt-2 text-right text-[10px] text-stone-400">更新 {jstDateTime(panel.updatedAt)}</p> : null}
    </div>
  );
}

/** パネルは PANEL_REGISTRY の順に並ぶ。データが無い / enabled=false のものは将来枠として表示 */
export function DomainPanels({ panels }: { panels: DomainPanel[] }) {
  const byKey = new Map(panels.map((p) => [p.key, p]));
  return (
    <OsCard id="domains" icon="🧩" title="部門別パネル" description="MEO・Instagram・SEO など全チャネル。パネルの追加は lib/os/panel-registry.ts に1行足すだけ。">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedPanels().map((def) => {
          const panel = byKey.get(def.key);
          return def.enabled && panel ? (
            <PanelCard key={def.key} def={def} panel={panel} />
          ) : (
            <PhasePlaceholder key={def.key} title={def.title} icon={def.icon} phase={def.phase} description={def.description} feeds={def.feeds} />
          );
        })}
      </div>
    </OsCard>
  );
}
