import type { AcceptanceStat, Decision } from "@/types/os";
import { jstDateTime } from "@/lib/os/format";
import { AGENT_META, OsCard } from "./ui";

const DEC: Record<Decision["decision"], { label: string; cls: string }> = {
  approve: { label: "承認", cls: "bg-emerald-100 text-emerald-800" },
  modify: { label: "修正", cls: "bg-blue-100 text-blue-800" },
  hold: { label: "保留", cls: "bg-orange-100 text-orange-800" },
  reject: { label: "却下", cls: "bg-rose-100 text-rose-800" },
};

export function DecisionsPanel({ decisions, acceptance }: { decisions: Decision[]; acceptance: AcceptanceStat[] }) {
  return (
    <OsCard id="learning" icon="🧠" title="判断履歴・学習" description="保存した承認・却下・保留だけを集計します。">
      <p className="text-[11px] font-bold text-stone-500">エージェント別 判断内訳</p>
      <div className="mt-2 space-y-2">
        {acceptance.every((item) => item.approved + item.modified + item.held + item.rejected === 0) ? (
          <p className="text-xs text-stone-500">保存された判断はまだありません。</p>
        ) : null}
        {acceptance.map((a) => {
          const total = a.approved + a.modified + a.held + a.rejected;
          if (total === 0) return null;
          const seg = (n: number) => `${(n / total) * 100}%`;
          const rate = Math.round(((a.approved + a.modified) / total) * 100);
          return (
            <div key={a.agentKey} className="text-xs">
              <div className="flex justify-between">
                <span className="font-semibold">
                  {AGENT_META[a.agentKey].icon} {a.label}
                </span>
                <span className="text-stone-500">
                  承認率 <b className="text-stone-800">{rate}%</b>（{total}件）
                </span>
              </div>
              <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-stone-100">
                <div className="bg-emerald-500" style={{ width: seg(a.approved) }} />
                <div className="bg-blue-400" style={{ width: seg(a.modified) }} />
                <div className="bg-orange-400" style={{ width: seg(a.held) }} />
                <div className="bg-rose-400" style={{ width: seg(a.rejected) }} />
              </div>
            </div>
          );
        })}
        <p className="flex flex-wrap gap-3 pt-1 text-[10px] text-stone-500">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />承認</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400" />修正</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-400" />保留</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />却下</span>
        </p>
      </div>

      <p className="mt-4 text-[11px] font-bold text-stone-500">最近の判断</p>
      <ul className="mt-1 divide-y divide-stone-100">
        {decisions.length === 0 ? <li className="py-2 text-xs text-stone-500">最近の判断はありません。</li> : null}
        {decisions.map((d) => (
          <li key={d.id} className="flex items-start gap-2 py-2 text-xs">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${DEC[d.decision].cls}`}>{DEC[d.decision].label}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-stone-800">{d.taskTitle}</p>
              {d.reasonText ? <p className="text-stone-500">理由：{d.reasonText}</p> : null}
            </div>
            <span className="shrink-0 text-[10px] text-stone-400">{jstDateTime(d.decidedAt)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-xl bg-stone-50 p-3 text-[11px] leading-5 text-stone-600">
        💡 学習メモ（サンプル）：<b>値引き系の提案は却下が多い</b> → 「値引きは提案しない」ルール案を作成し、承認されたら反映（Phase 5）。
      </div>
    </OsCard>
  );
}
