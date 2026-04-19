import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { TenantAccessBadge } from "@/components/TenantAccessBadge";

const navigationItems = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/projects", label: "プロジェクト" },
  { href: "/admin/tenant-access", label: "権限管理" },
];

interface AppShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, description, actions, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ea_0%,_#fffdf8_40%,_#fff7ed_100%)] text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl gap-6 px-4 py-6 md:px-8">
        <aside className="hidden w-64 shrink-0 rounded-[28px] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_30px_80px_rgba(28,25,23,0.28)] lg:block">
          <p className="text-xs uppercase tracking-[0.35em] text-orange-300">
            AI Maneger
          </p>
          <h1 className="mt-4 text-2xl font-bold leading-tight">
            Notion中心の
            <br />
            プロジェクト管理
          </h1>
          <nav className="mt-10 space-y-2">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl px-4 py-3 text-sm text-stone-300 transition hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-stone-300">
            Notion を正本にしつつ、通常運用はダッシュボードから完結させるためのUIです。
          </div>
        </aside>

        <div className="flex-1">
          <header className="rounded-[28px] border border-stone-900/10 bg-white/80 p-6 shadow-[0_18px_60px_rgba(120,53,15,0.08)] backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-orange-700">
                  {process.env.NEXT_PUBLIC_APP_NAME || "AI Maneger"}
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">{title}</h2>
                {description ? (
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? <div className="shrink-0">{actions}</div> : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <TenantAccessBadge />
              <LogoutButton />
            </div>
          </header>

          <main className="mt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
