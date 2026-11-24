import { Phase2Stub } from "@/components/app/phase2-stub";
import { loadOrgPage } from "@/lib/org-page";

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug } = await params;
  await loadOrgPage(orgSlug);
  return <Phase2Stub title="訪問詳細" description="位置、写真、結果を同じ企業の範囲で表示します。" />;
}
