interface ErrorPanelProps {
  title?: string;
  message: string;
}

export function ErrorPanel({
  title = "データの取得に失敗しました",
  message,
}: ErrorPanelProps) {
  return (
    <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-rose-900">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-7">{message}</p>
    </div>
  );
}
