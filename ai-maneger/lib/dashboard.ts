import type { DashboardSummary, Project } from "@/types/project";

const DEFAULT_STATUSES = ["計画中", "進行中", "レビュー", "完了", "保留"];

export function buildDashboardSummary(projects: Project[]): DashboardSummary {
  const statusCounts = DEFAULT_STATUSES.reduce<Record<string, number>>(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {},
  );

  for (const project of projects) {
    if (!statusCounts[project.status]) {
      statusCounts[project.status] = 0;
    }

    statusCounts[project.status] += 1;
  }

  const averageProgress =
    projects.length === 0
      ? 0
      : Math.round(
          projects.reduce((sum, project) => sum + project.progress, 0) / projects.length,
        );

  const now = new Date();

  const upcomingProjects = [...projects]
    .filter((project) => project.endDate)
    .filter((project) => new Date(project.endDate as string) >= now)
    .sort((left, right) => {
      return (
        new Date(left.endDate as string).getTime() -
        new Date(right.endDate as string).getTime()
      );
    })
    .slice(0, 5);

  const recentProjects = [...projects]
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, 5);

  return {
    totalProjects: projects.length,
    averageProgress,
    statusCounts,
    upcomingProjects,
    recentProjects,
  };
}
