import Link from "next/link";
import { AppShell } from "@/components/common/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { getProjects } from "@/lib/notion/projects";
import type { Project } from "@/types/project";

interface ProjectsPageProps {
  searchParams?: {
    status?: string;
    businessType?: string;
    q?: string;
    sort?: string;
  };
}

function filterProjects(projects: Project[], params: ProjectsPageProps["searchParams"]) {
  const keyword = params?.q?.trim().toLowerCase() ?? "";
  const status = params?.status ?? "";
  const businessType = params?.businessType ?? "";
  const sort = params?.sort ?? "updated";

  const filtered = projects.filter((project) => {
    const matchKeyword =
      keyword.length === 0 ||
      project.name.toLowerCase().includes(keyword) ||
      (project.kpiActual ?? "").toLowerCase().includes(keyword);

    const matchStatus = status.length === 0 || project.status === status;
    const matchBusinessType =
      businessType.length === 0 || project.businessType === businessType;

    return matchKeyword && matchStatus && matchBusinessType;
  });

  filtered.sort((left, right) => {
    if (sort === "progress") {
      return right.progress - left.progress;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  return filtered;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const projects = await getProjects();
  const filteredProjects = filterProjects(projects, searchParams);
  const statuses = Array.from(new Set(projects.map((project) => project.status).filter(Boolean)));
  const businessTypes = Array.from(
    new Set(projects.map((project) => project.businessType).filter(Boolean)),
  );

  return (
    <AppShell
      title="プロジェクト一覧"
      description="ステータス、事業区分、キーワードで絞り込みながら、Notion上の案件を一覧で確認できます。"
    >
      <SectionCard title="絞り込み">
        <form className="grid gap-4 md:grid-cols-4">
          <input
            type="text"
            name="q"
            placeholder="プロジェクト名で検索"
            defaultValue={searchParams?.q ?? ""}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none ring-0 transition focus:border-stone-900/30"
          />
          <select
            name="status"
            defaultValue={searchParams?.status ?? ""}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">全ステータス</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            name="businessType"
            defaultValue={searchParams?.businessType ?? ""}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="">全事業区分</option>
            {businessTypes.map((businessType) => (
              <option key={businessType} value={businessType}>
                {businessType}
              </option>
            ))}
          </select>
          <select
            name="sort"
            defaultValue={searchParams?.sort ?? "updated"}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm outline-none"
          >
            <option value="updated">更新日順</option>
            <option value="progress">進捗順</option>
          </select>
          <button
            type="submit"
            className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white md:col-span-4 md:w-fit"
          >
            絞り込む
          </button>
        </form>
      </SectionCard>

      <section className="mt-6">
        <SectionCard title="案件一覧" description={`該当件数: ${filteredProjects.length}件`}>
          {filteredProjects.length === 0 ? (
            <EmptyState
              title="該当する案件がありません"
              description="検索条件を変えるか、Notion のプロジェクトDBに案件を追加してください。"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-900/10 text-stone-500">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">プロジェクト名</th>
                    <th className="pb-3 pr-4 font-medium">ステータス</th>
                    <th className="pb-3 pr-4 font-medium">進捗率</th>
                    <th className="pb-3 pr-4 font-medium">開始日</th>
                    <th className="pb-3 pr-4 font-medium">終了予定</th>
                    <th className="pb-3 pr-4 font-medium">事業区分</th>
                    <th className="pb-3 font-medium">更新日</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => (
                    <tr key={project.id} className="border-b border-stone-900/5">
                      <td className="py-4 pr-4">
                        <Link href={`/projects/${project.id}`} className="font-semibold hover:underline">
                          {project.name}
                        </Link>
                      </td>
                      <td className="py-4 pr-4">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="py-4 pr-4">{project.progress}%</td>
                      <td className="py-4 pr-4">{formatDate(project.startDate)}</td>
                      <td className="py-4 pr-4">{formatDate(project.endDate)}</td>
                      <td className="py-4 pr-4">{project.businessType || "未設定"}</td>
                      <td className="py-4">{formatDateTime(project.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </section>
    </AppShell>
  );
}
