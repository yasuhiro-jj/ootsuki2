import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { ErrorPanel } from "@/components/common/error-panel";
import { SectionCard } from "@/components/common/section-card";
import { ProjectUpdateForm } from "@/components/projects/project-update-form";
import { getCurrentTenantAccessResult } from "@/lib/api/tenant-access";
import { getProjectById } from "@/lib/notion/projects";
import { updateProjectAction } from "./actions";

interface EditProjectPageProps {
  params: { id: string };
}

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const access = await getCurrentTenantAccessResult("write");
  if (!access.ok) {
    return (
      <AppShell title="アクセス不可" description="tenant / role の認可を満たした場合のみ更新画面を表示します。">
        <ErrorPanel title="更新画面を開けません" message={access.message} />
      </AppShell>
    );
  }

  const project = await getProjectById(params.id);
  const action = updateProjectAction.bind(null, params.id);

  return (
    <AppShell
      title={`更新: ${project.name}`}
      description="基本情報、担当、進行状況、KPI、日付を更新して Notion へ反映します。"
      actions={
        <Link
          href={`/projects/${params.id}`}
          className="inline-flex rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-900"
        >
          詳細へ戻る
        </Link>
      }
    >
      <SectionCard
        title="プロジェクト更新フォーム"
        description="主要プロパティをまとめて編集し、詳細に運用できるようにしています。"
      >
        <ProjectUpdateForm project={project} action={action} />
      </SectionCard>
    </AppShell>
  );
}
