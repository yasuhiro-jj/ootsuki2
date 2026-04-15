import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/common/app-shell";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ProjectContent } from "@/components/projects/project-content";
import { RecommendedAgentList } from "@/components/projects/recommended-agent-list";
import { formatDate, formatDateTime } from "@/lib/format";
import { getPageExcerpt } from "@/lib/notion/pages";
import { getProjectById } from "@/lib/notion/projects";

interface ProjectDetailPageProps {
  params: { id: string };
}

const detailFields = [
  { label: "プロジェクト名", key: "name" },
  { label: "事業区分", key: "businessType" },
  { label: "担当部署", key: "department" },
  { label: "担当エージェント", key: "assignedAgent" },
] as const;

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const [project, pageBlocks] = await Promise.all([
    getProjectById(params.id),
    getPageExcerpt(params.id),
  ]);

  if (!project.id) {
    notFound();
  }

  return (
    <AppShell
      title={project.name || "プロジェクト詳細"}
      description="概要、KPI、戦略メモ、関連情報、推奨エージェントを一画面で確認します。"
      actions={
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/projects/${project.id}/edit`}
            className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white"
          >
            更新する
          </Link>
          {project.url ? (
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-900"
            >
              Notionで開く
            </a>
          ) : null}
        </div>
      }
    >
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="概要" description="主要項目は Notion DB の値をそのまま表示します。">
          <div className="grid gap-4 md:grid-cols-2">
            {detailFields.map((field) => (
              <div key={field.key} className="rounded-2xl bg-stone-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  {field.label}
                </p>
                <p className="mt-2 text-base font-semibold text-stone-900">
                  {project[field.key] || "未設定"}
                </p>
              </div>
            ))}
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">ステータス</p>
              <div className="mt-2">
                <StatusBadge status={project.status} />
              </div>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">進捗率</p>
              <p className="mt-2 text-base font-semibold text-stone-900">{project.progress}%</p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">開始日</p>
              <p className="mt-2 text-base font-semibold text-stone-900">
                {formatDate(project.startDate)}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">終了予定</p>
              <p className="mt-2 text-base font-semibold text-stone-900">
                {formatDate(project.endDate)}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="タブ概要" description="MVPでは主要タブの情報を1画面に集約しています。">
          <div className="grid gap-3 text-sm">
            {["概要", "KPI", "戦略", "実行", "履歴"].map((tab) => (
              <div key={tab} className="rounded-2xl border border-stone-900/10 px-4 py-3">
                {tab}
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="KPI" description="KPI 目標と実績を確認します。">
          <div className="grid gap-4">
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">KPI目標</p>
              <p className="mt-2 text-sm leading-7 text-stone-700">
                {project.kpiTarget || "未設定"}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">KPI実績</p>
              <p className="mt-2 text-sm leading-7 text-stone-700">
                {project.kpiActual || "未設定"}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">更新日</p>
              <p className="mt-2 text-sm text-stone-700">{formatDateTime(project.updatedAt)}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="関連ページ / 関連DB"
          description="MVPでは Notion ページ本文の要約表示と元ページへのリンクを優先します。"
        >
          <div className="grid gap-3 text-sm text-stone-700">
            <div className="rounded-2xl border border-stone-900/10 px-4 py-4">
              戦略・設計・次アクションは本文抜粋から参照
            </div>
            <div className="rounded-2xl border border-stone-900/10 px-4 py-4">
              KPI / 週次レビュー / 実行ログ / タスクDB は後続で接続しやすい構成
            </div>
            {project.url ? (
              <a
                href={project.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-stone-900/10 px-4 py-4 font-medium text-orange-700"
              >
                Notionの元ページを開く
              </a>
            ) : null}
          </div>
        </SectionCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="戦略 / 設計メモ / 次アクション" description="ページ本文の先頭10ブロックのみ表示します。">
          <ProjectContent blocks={pageBlocks} />
        </SectionCard>

        <SectionCard title="推奨エージェント" description="画面参照用として役割説明を表示しています。">
          <RecommendedAgentList />
        </SectionCard>
      </section>
    </AppShell>
  );
}
