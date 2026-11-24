import { Phase2Stub } from "@/components/app/phase2-stub";
import { loadOrgPage } from "@/lib/org-page";

export default async function VisitsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await loadOrgPage(orgSlug);
  return <Phase2Stub title="訪問一覧" description="自社の訪問だけを日付と担当で絞り込みます。" />;
}
