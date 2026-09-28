import type { Connector } from "@/types/os";
import { jstDateTime } from "@/lib/os/format";
import { CONNECTOR_META, ConnectorBadge, OsCard } from "./ui";

export function ConnectorsPanel({ connectors }: { connectors: Connector[] }) {
  const counts = connectors.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
  return (
    <OsCard id="connectors" icon="🔌" title="データ接続状況" description="connectors テーブル。Grok Bot 経由のものは段階的にアプリ内のコネクタへ置き換え。">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600">
            {CONNECTOR_META[k as Connector["status"]].label} <b>{n}</b>
          </span>
        ))}
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {connectors.map((c) => (
          <li key={c.key} className="flex items-center gap-2 rounded-xl border border-stone-900/5 bg-stone-50/70 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-800">{c.label}</p>
              <p className="truncate text-[10px] text-stone-500">
                {c.via ?? "—"}
                {c.lastSyncAt ? `・${jstDateTime(c.lastSyncAt)}` : ""}
                {c.note ? `・${c.note}` : ""}
              </p>
            </div>
            <ConnectorBadge status={c.status} phase={c.phase} />
          </li>
        ))}
      </ul>
    </OsCard>
  );
}
