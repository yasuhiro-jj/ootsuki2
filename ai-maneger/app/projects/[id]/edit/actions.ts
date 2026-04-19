"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logCurrentTenantAudit } from "@/lib/api/audit";
import { requireCurrentTenantAccess } from "@/lib/api/tenant-access";
import { updateProject } from "@/lib/notion/projects";

interface ProjectUpdateState {
  error?: string;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateProjectAction(
  projectId: string,
  _previousState: ProjectUpdateState,
  formData: FormData,
): Promise<ProjectUpdateState> {
  const name = readString(formData, "name");
  const status = readString(formData, "status");
  const progressValue = readString(formData, "progress");
  const businessType = readString(formData, "businessType");
  const department = readString(formData, "department");
  const assignedAgent = readString(formData, "assignedAgent");
  const kpiTarget = readString(formData, "kpiTarget");
  const kpiActual = readString(formData, "kpiActual");
  const startDate = readString(formData, "startDate");
  const endDate = readString(formData, "endDate");

  if (!name) {
    return { error: "プロジェクト名を入力してください。" };
  }

  if (!status) {
    return { error: "ステータスを選択してください。" };
  }

  const progress = Number(progressValue);

  if (Number.isNaN(progress) || progress < 0 || progress > 100) {
    return { error: "進捗率は 0 から 100 の数値で入力してください。" };
  }

  try {
    const access = await requireCurrentTenantAccess("write");
    await updateProject(projectId, {
      name,
      status,
      progress,
      businessType,
      department,
      assignedAgent,
      kpiTarget,
      kpiActual,
      startDate,
      endDate,
    });
    await logCurrentTenantAudit(access, {
      action: "project.update",
      resourceType: "project",
      resourceId: projectId,
      metadata: { name, status, progress },
      path: `/projects/${projectId}/edit`,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `更新に失敗しました: ${error.message}`
          : "更新に失敗しました。再試行してください。",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);

  redirect(`/projects/${projectId}`);
}
