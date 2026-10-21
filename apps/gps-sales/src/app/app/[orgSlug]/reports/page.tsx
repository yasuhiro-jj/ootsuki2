import { Phase2Stub } from "@/components/app/phase2-stub";
import { loadOrgPage } from "@/lib/org-page";

export default async function ReportsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await loadOrgPage(orgSlug);
  return <Phase2Stub title="報告書" description="日次と月次の PDF は Phase 3 です。" />;
}
