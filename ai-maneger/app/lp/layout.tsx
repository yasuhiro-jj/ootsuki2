import type { Viewport } from "next";
import type { ReactNode } from "react";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#5b21b6",
};

/** LP はスマホ1カラム基準（最大幅480px）。md以上はフルワイドに戻す。 */
export default function LpLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-dvh bg-stone-200/60 md:bg-white">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] overflow-x-hidden bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-[0_0_24px_rgba(0,0,0,0.08)] md:max-w-none md:shadow-none">
        {children}
      </div>
    </div>
  );
}
