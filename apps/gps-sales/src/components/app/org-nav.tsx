import { LogoutButton } from "@/components/auth/logout-button";
import Link from "next/link";

const links = [
  ["dashboard", "ダッシュボード"],
  ["customers", "顧客"],
  ["visits", "訪問"],
  ["map", "地図"],
  ["reports", "報告書"],
  ["settings/members", "メンバー"],
  ["settings/organization", "組織設定"],
] as const;

export function OrgNav({ slug, name }: { slug: string; name: string }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">GPS営業訪問</p>
            <p className="font-medium">{name}</p>
          </div>
          <LogoutButton />
        </div>
        <nav className="flex flex-wrap gap-3 text-sm">
          {links.map(([path, label]) => (
            <Link key={path} href={`/app/${slug}/${path}`} className="text-primary underline-offset-4 hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
