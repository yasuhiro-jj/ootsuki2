import {
  getPropertyDate,
  getPropertyNumber,
  getPropertyText,
  queryDatabaseAll,
  updatePage,
} from "@/lib/notion/client";
import type { Project, ProjectUpdatePayload } from "@/types/project";
import type { NotionPage } from "@/types/notion";

const PROJECT_DB_ID = process.env.NOTION_PROJECT_DB_ID?.trim() || "";

function mapProject(page: NotionPage): Project {
  const { properties } = page;

  return {
    id: page.id,
    name: getPropertyText(properties, ["案件名", "プロジェクト名", "名前", "Name", "title"]) || "名称未設定",
    status: getPropertyText(properties, ["ステータス", "Status", "進行状況"]) || "未設定",
    progress: getPropertyNumber(properties, ["進捗率", "Progress", "進捗"]) ?? 0,
    startDate: getPropertyDate(properties, ["開始日", "Start Date", "開始"]),
    endDate: getPropertyDate(properties, ["終了予定", "終了日", "End Date"]),
    businessType: getPropertyText(properties, ["事業区分", "Business Type"]),
    kpiTarget: getPropertyText(properties, ["KPI目標", "KPI Target"]),
    kpiActual: getPropertyText(properties, ["KPI実績", "KPI Actual"]),
    department: getPropertyText(properties, ["担当部署", "Department"]),
    assignedAgent: getPropertyText(properties, ["担当エージェント", "Assigned Agent"]),
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
    url: page.url,
  };
}

function buildRichText(content: string) {
  return [{ type: "text", text: { content } }];
}

export async function getProjects() {
  const pages = await queryDatabaseAll(PROJECT_DB_ID, {
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  return pages.map(mapProject);
}

export async function getProjectById(projectId: string) {
  const projects = await getProjects();
  return (
    projects.find((project) => project.id === projectId) ?? {
      id: "",
      name: "",
      status: "",
      progress: 0,
      updatedAt: new Date(0).toISOString(),
    }
  );
}

export async function updateProject(projectId: string, payload: ProjectUpdatePayload) {
  const properties: Record<string, unknown> = {};

  if (payload.name !== undefined) {
    properties["案件名"] = { title: buildRichText(payload.name) };
  }
  if (payload.status !== undefined) {
    properties["ステータス"] = { status: { name: payload.status || "未設定" } };
  }
  if (payload.progress !== undefined) {
    properties["進捗率"] = { number: payload.progress };
  }
  if (payload.businessType !== undefined) {
    properties["事業区分"] = { rich_text: buildRichText(payload.businessType) };
  }
  if (payload.department !== undefined) {
    properties["担当部署"] = { rich_text: buildRichText(payload.department) };
  }
  if (payload.assignedAgent !== undefined) {
    properties["担当エージェント"] = { rich_text: buildRichText(payload.assignedAgent) };
  }
  if (payload.kpiTarget !== undefined) {
    properties["KPI目標"] = { rich_text: buildRichText(payload.kpiTarget) };
  }
  if (payload.kpiActual !== undefined) {
    properties["KPI実績"] = { rich_text: buildRichText(payload.kpiActual) };
  }
  if (payload.startDate !== undefined) {
    properties["開始日"] = payload.startDate ? { date: { start: payload.startDate } } : { date: null };
  }
  if (payload.endDate !== undefined) {
    properties["終了予定"] = payload.endDate ? { date: { start: payload.endDate } } : { date: null };
  }

  await updatePage(projectId, { properties });
}
