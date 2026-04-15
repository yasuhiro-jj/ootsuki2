import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { EmptyState } from "@/components/common/empty-state";

export default function NotFound() {
  return (
    <AppShell title="ページが見つかりません" description="指定されたプロジェクトまたは画面にアクセスできません。">
      <EmptyState
        title="対象データが見つかりません"
        description="Notion 側でページが削除されたか、URL が誤っている可能性があります。"
      />
      <div className="mt-6">
        <Link
          href="/projects"
          className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white"
        >
          プロジェクト一覧へ戻る
        </Link>
      </div>
    </AppShell>
  );
}
