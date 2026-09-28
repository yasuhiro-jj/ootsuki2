import type { OsDashboardData } from "@/types/os";
import { jstDate, jstTime } from "@/lib/os/format";
import { OriginTag } from "./ui";

export function SampleBanner() {
  return (
    <div className="sticky top-0 z-30 border-b border-amber-300 bg-amber-100/95 px-4 py-2 text-center text-xs font-bold text-amber-900 backdrop-blur md:text-sm">
      ⚠️ サンプルデータ（表示確認用）｜「実績」タグ以外の数値はダミーです
    </div>
  );
}

function HealthRing({ score }: { score: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#059669" : score >= 60 ? "#ea580c" : "#dc2626";
  return (
    <svg viewBox="0 0 76 76" className="h-[76px] w-[76px] shrink-0 -rotate-90">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#e7e5e4" strokeWidth="8" />
      <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} />
      <text x="38" y="44" textAnchor="middle" transform="rotate(90 38 38)" className="fill-stone-900 text-[20px] font-bold">
        {score}
      </text>
    </svg>
  );
}

export function DashboardHeader({ data }: { data: OsDashboardData }) {
  return (
    <header className="rounded-3xl border border-stone-900/10 bg-white/85 p-4 shadow-[0_18px_60px_rgba(120,53,15,0.08)] backdrop-blur md:rounded-[28px] md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.3em] text-orange-700 md:text-xs">AI会社OS ／ AI Maneger</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{data.tenant.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 md:text-sm">
            <span className="rounded-full bg-stone-900 px-2.5 py-0.5 font-mono text-[11px] text-orange-200">tenant: {data.tenant.key}</span>
            <span>📅 {jstDate(data.businessDate)}</span>
            <span>🔄 最終更新 {jstTime(data.generatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <HealthRing score={data.health.score} />
          <p className="mt-1 text-[11px] font-bold text-stone-700">健康スコア・{data.health.label}</p>
          <OriginTag origin={data.health.origin} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-1.5">
        {data.health.breakdown.map((b) => (
          <div key={b.label} className="rounded-xl bg-stone-50 px-1 py-2 text-center">
            <p className="text-[10px] text-stone-500">{b.label}</p>
            <p className={`text-sm font-bold ${b.score >= 80 ? "text-emerald-700" : b.score >= 60 ? "text-orange-600" : "text-rose-600"}`}>{b.score}</p>
          </div>
        ))}
      </div>
    </header>
  );
}

export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className="sticky top-[33px] z-20 -mx-4 overflow-x-auto bg-[#fbf8f0]/90 px-4 py-2 backdrop-blur md:top-[37px] md:mx-0 md:rounded-2xl md:px-3">
      <ul className="flex w-max gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className="block whitespace-nowrap rounded-full border border-stone-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:border-orange-300 hover:text-orange-700">
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
