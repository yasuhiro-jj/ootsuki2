import { Phase2Stub } from "@/components/app/phase2-stub";
import { loadOrgPage } from "@/lib/org-page";

export default async function MapPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await loadOrgPage(orgSlug);
  return <Phase2Stub title="地図" description="日付、担当、地域で自社の訪問ピンを表示します。" />;
}
