const toneMap: Record<string, string> = {
  計画中: "bg-slate-100 text-slate-700",
  進行中: "bg-blue-100 text-blue-700",
  レビュー: "bg-amber-100 text-amber-700",
  完了: "bg-emerald-100 text-emerald-700",
  保留: "bg-rose-100 text-rose-700",
};

export function StatusBadge({ status }: { status?: string }) {
  const tone = toneMap[status ?? ""] ?? "bg-stone-100 text-stone-700";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {status || "未設定"}
    </span>
  );
}
