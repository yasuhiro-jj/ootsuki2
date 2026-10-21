import { Phase2Stub } from "@/components/app/phase2-stub";
import { loadOrgPage } from "@/lib/org-page";

export default async function NewVisitPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await loadOrgPage(orgSlug);
  return (
    <Phase2Stub
      title="訪問を開始"
      description="開始操作のときだけ位置情報を取得します。精度が50mを超える場合は警告し、登録自体は禁止しません。"
    />
  );
}
