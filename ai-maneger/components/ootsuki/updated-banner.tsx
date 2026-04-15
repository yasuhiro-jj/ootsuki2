"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function UpdatedBanner() {
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const updated = searchParams.get("updated");
    const error = searchParams.get("error");

    if (updated === "1") {
      setVisible(true);
      setIsError(false);
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }

    if (error) {
      setVisible(true);
      setIsError(true);
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  if (!visible) return null;

  return (
    <div
      className={`rounded-2xl px-4 py-3 text-sm font-medium ${
        isError
          ? "border border-rose-200 bg-rose-50 text-rose-800"
          : "border border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {isError
        ? "週次集計の更新に失敗しました。時間をおいて再試行してください。"
        : "週次集計を更新しました。最新データが表示されています。"}
    </div>
  );
}
