"use client";

import { useFormState } from "react-dom";
import type { Project } from "@/types/project";
import { ProjectUpdateSubmit } from "./project-update-submit";

interface ProjectUpdateState {
  error?: string;
}

interface ProjectUpdateFormProps {
  project: Project;
  action: (
    state: ProjectUpdateState,
    formData: FormData,
  ) => Promise<ProjectUpdateState>;
}

const statusOptions = ["計画中", "進行中", "レビュー", "完了", "保留"];

export function ProjectUpdateForm({ project, action }: ProjectUpdateFormProps) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="grid gap-6">
      <section className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-stone-700 md:col-span-2">
          プロジェクト名
          <input
            name="name"
            type="text"
            defaultValue={project.name}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-stone-700">
          事業区分
          <input
            name="businessType"
            type="text"
            defaultValue={project.businessType}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-stone-700">
          担当部署
          <input
            name="department"
            type="text"
            defaultValue={project.department}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-stone-700 md:col-span-2">
          担当エージェント
          <input
            name="assignedAgent"
            type="text"
            defaultValue={project.assignedAgent}
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
          />
        </label>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium text-stone-700">
        ステータス
        <select
          name="status"
          defaultValue={project.status}
          className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        進捗率
        <input
          name="progress"
          type="number"
          min="0"
          max="100"
          defaultValue={project.progress}
          className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        開始日
        <input
          name="startDate"
          type="date"
          defaultValue={project.startDate}
          className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        終了予定
        <input
          name="endDate"
          type="date"
          defaultValue={project.endDate}
          className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>
      </section>

      <section className="grid gap-5">
      <label className="grid gap-2 text-sm font-medium text-stone-700">
        KPI目標
        <textarea
          name="kpiTarget"
          rows={4}
          defaultValue={project.kpiTarget}
          className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-stone-700 md:col-span-2">
        KPI実績
        <textarea
          name="kpiActual"
          rows={6}
          defaultValue={project.kpiActual}
          className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>
      </section>

      {state.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {state.error}
        </div>
      ) : null}

      <div>
        <ProjectUpdateSubmit />
      </div>
    </form>
  );
}
