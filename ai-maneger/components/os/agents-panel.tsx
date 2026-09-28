import type { AgentStatus, GrokBotStatus } from "@/types/os";
import { jstDateTime } from "@/lib/os/format";
import { AGENT_META, OsCard } from "./ui";

const STATE: Record<string, { label: string; cls: string }> = {
  ok: { label: "正常", cls: "bg-emerald-100 text-emerald-800" },
  running: { label: "実行中", cls: "bg-violet-100 text-violet-800" },
  error: { label: "エラー", cls: "bg-red-100 text-red-700" },
  idle: { label: "待機", cls: "bg-stone-100 text-stone-600" },
  planned: { label: "準備中", cls: "bg-stone-100 text-stone-400" },
  not_linked: { label: "未連携", cls: "bg-stone-100 text-stone-400" },
};

function Bar({ rate }: { rate?: number }) {
  if (typeof rate !== "number") return <span className="text-[10px] text-stone-400">承認率 —</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round(rate * 100)}%` }} />
      </div>
      <span className="w-14 text-right text-[10px] text-stone-600">承認 {Math.round(rate * 100)}%</span>
    </div>
  );
}

export function AgentsPanel({ agents, grokBots }: { agents: AgentStatus[]; grokBots: GrokBotStatus[] }) {
  return (
      <OsCard id="agents" icon="🤖" title="AIエージェントの状態" description="売上と財務は日次から算出します。未接続のエージェントは待機です。">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {agents.map((a) => {
          const meta = AGENT_META[a.key];
          const st = STATE[a.state];
          return (
            <div key={a.key} className={`rounded-2xl border p-3 ${a.key === "manager" ? "col-span-2 border-orange-300 bg-orange-50/60 md:col-span-3 xl:col-span-2" : "border-stone-900/10 bg-white"} ${a.state === "planned" ? "border-dashed opacity-70" : ""}`}>
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-sm font-bold">
                  {meta.icon} {a.label}
                </p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                  {st.label}
                  {a.phase ? ` P${a.phase}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-4 text-stone-500">{a.role}</p>
              <p className="mt-1.5 text-[10px] text-stone-500">
                最終実行 {a.lastRunAt ? jstDateTime(a.lastRunAt) : "—"}・発見 <b className="text-stone-800">{a.findingsCount}</b>
                {typeof a.proposedCount === "number" ? <> ・提案 <b className="text-stone-800">{a.proposedCount}</b></> : null}
              </p>
              {a.key !== "manager" ? <div className="mt-1.5"><Bar rate={a.acceptanceRate} /></div> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50/70 p-3">
        <p className="text-sm font-bold text-amber-900">🟠 既存の Grok Bot（外部エージェント）</p>
        <p className="text-[11px] text-amber-800">発見は JSON で POST /api/os/ingest に送るだけ。タスクの作成・承認・外部送信はしない。</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {grokBots.map((b) => {
            const st = STATE[b.state];
            return (
              <div key={b.key} className="rounded-xl bg-white p-3 ring-1 ring-amber-200">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-sm font-bold">{b.label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">{b.role}</p>
                <p className="mt-1 text-[10px] text-stone-500">
                  送信：{b.feeds}・{b.schedule}・最終 {b.lastIngestAt ? jstDateTime(b.lastIngestAt) : "—"}・発見 {b.findingsCount}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </OsCard>
  );
}
