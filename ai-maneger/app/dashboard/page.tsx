import { AppShell } from "@/components/common/app-shell";
import { ErrorPanel } from "@/components/common/error-panel";
import { SectionCard } from "@/components/common/section-card";
import { DailyInputForm } from "@/components/ootsuki/daily-input-form";
import { AgentRequestHub } from "@/components/ootsuki/agent-request-hub";
import { DashboardAgentChat } from "@/components/ootsuki/dashboard-agent-chat";
import { DecisionMemoForm } from "@/components/ootsuki/decision-memo-form";
import { WeeklyReviewForm } from "@/components/ootsuki/weekly-review-form";
import { RefreshWeeklySummaryButton } from "@/components/ootsuki/refresh-weekly-summary-button";
import { SalesOverviewPanel } from "@/components/ootsuki/sales-overview-panel";
import { UpdatedBanner } from "@/components/ootsuki/updated-banner";
import { WeeklyActionsPanel } from "@/components/ootsuki/weekly-actions-panel";
import { WeeklyJudgmentPanel } from "@/components/ootsuki/weekly-judgment-panel";
import { recommendedAgents } from "@/lib/agents";
import { getCurrentTenantAccessResult } from "@/lib/api/tenant-access";
import { formatDateTime } from "@/lib/format";
import {
  aggregateWeek,
  attachWeekOverWeek,
  buildMetricAlerts,
  formatCount,
  formatPercentDelta,
  formatPercentValue,
  formatYen,
  isWeeklySummaryEntry,
} from "@/lib/ootsuki";
import {
  getLatestDecisionMemoEntries,
  getKpiEntries,
  getLatestStrategyMemo,
  getLatestWeeklyReviewEntries,
  getOotsukiProjectOverview,
  getWeeklyActionPlan,
  getWeeklyReviewDraft,
} from "@/lib/notion/ootsuki";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";

export const dynamic = "force-dynamic";

const BUILD_TIMESTAMP = "v2-20260412-2";

function todayInTokyo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function DashboardPage() {
  const access = await getCurrentTenantAccessResult("read");
  if (!access.ok) {
    return (
      <AppShell title="アクセス不可" description="tenant / role の認可を満たした場合のみダッシュボードを表示します。">
        <ErrorPanel title="ダッシュボードを開けません" message={access.message} />
      </AppShell>
    );
  }

  const [
    projectResult,
    entriesResult,
    latestMemoResult,
    latestWeeklyReviewsResult,
    memoEntriesResult,
  ] = await Promise.allSettled([
    getOotsukiProjectOverview(),
    getKpiEntries(),
    getLatestStrategyMemo(),
    getLatestWeeklyReviewEntries(1),
    getLatestDecisionMemoEntries(5),
  ]);
  const project =
    projectResult.status === "fulfilled"
      ? projectResult.value
      : {
          id: "",
          name: "食事処おおつき",
          status: "未設定",
          kpiTarget: "未設定",
          kpiActual: "未設定",
          updatedAt: new Date(0).toISOString(),
        };
  const entries = entriesResult.status === "fulfilled" ? entriesResult.value : [];
  const latestMemo = latestMemoResult.status === "fulfilled" ? latestMemoResult.value : null;
  const latestWeeklyReviews =
    latestWeeklyReviewsResult.status === "fulfilled" ? latestWeeklyReviewsResult.value : [];
  const memoEntries = memoEntriesResult.status === "fulfilled" ? memoEntriesResult.value : [];
  const now = new Date();
  const currentWeek = aggregateWeek(entries, now);
  const previousWeek = aggregateWeek(
    entries,
    new Date(new Date(`${currentWeek.weekStart}T00:00:00.000Z`).getTime() - 86400000),
  );
  const weekSummary = attachWeekOverWeek(currentWeek, previousWeek);
  const metricAlerts = buildMetricAlerts(weekSummary);
  const latestWeeklyReview = latestWeeklyReviews[0];
  const judgmentMaterial =
    latestWeeklyReview &&
    (!latestMemo ||
      new Date(latestWeeklyReview.updatedAt).getTime() >= new Date(latestMemo.updatedAt).getTime())
      ? latestWeeklyReview
      : latestMemo;
  const judgmentSourceLabel =
    judgmentMaterial?.category === "振り返り" ? "最新週次レビュー" : "最新判断メモ";
  const [currentDraftResult, weeklyActionPlanResult] = await Promise.allSettled([
    getWeeklyReviewDraft(weekSummary.weekStart, weekSummary.weekEnd),
    getWeeklyActionPlan(weekSummary.weekStart, weekSummary.weekEnd),
  ]);
  const currentDraft = currentDraftResult.status === "fulfilled" ? currentDraftResult.value : null;
  const weeklyActionPlan =
    weeklyActionPlanResult.status === "fulfilled" ? weeklyActionPlanResult.value : null;
  const dailyEntries = entries.filter((entry) => !isWeeklySummaryEntry(entry));
  const currentDailyEntries = entries
    .filter(
      (entry) =>
        !isWeeklySummaryEntry(entry) &&
        entry.weekStart === weekSummary.weekStart &&
        entry.weekEnd === weekSummary.weekEnd &&
        (entry.sales || 0) > 0,
    )
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const agentChatEnabled = Boolean(process.env.OPENAI_API_KEY?.trim());
  const weeklyActionsConfigReady = Boolean((await getActiveTenantNotionConfig()).weeklyActionsDbId);
  const dashboardTitle = access.tenant === "demo" ? "デモダッシュボード" : "おおつき ダッシュボード";
  const projectDisplayName = access.tenant === "demo" ? "デモ店" : project.name;
  const canWriteMemo = access.role === "editor" || access.role === "admin" || access.role === "owner";

  return (
    <AppShell
      title={dashboardTitle}
      description="日次入力、今週の数字確認、週次レビュー、LINE配信文の確認までを一画面で回せる運用画面です。通常作業はこの画面を起点に進めます。"
    >
      <UpdatedBanner />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SectionCard>
          <p className="text-sm text-stone-500">今週売上</p>
          <p className="mt-3 text-4xl font-bold">{formatYen(weekSummary.sales)}</p>
          <p className="mt-2 text-sm text-stone-500">
            前週比 {formatPercentDelta(weekSummary.salesWoW)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-stone-500">今週客数</p>
          <p className="mt-3 text-4xl font-bold">{formatCount(weekSummary.customers)}</p>
          <p className="mt-2 text-sm text-stone-500">
            前週比 {formatPercentDelta(weekSummary.customersWoW)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-stone-500">今週客単価</p>
          <p className="mt-3 text-4xl font-bold">{formatYen(weekSummary.averageSpend)}</p>
          <p className="mt-2 text-sm text-stone-500">
            前週比 {formatPercentDelta(weekSummary.averageSpendWoW)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-stone-500">入力済み日数</p>
          <p className="mt-3 text-4xl font-bold">{weekSummary.totalDays}</p>
          <p className="mt-2 text-sm text-stone-500">
            {weekSummary.weekStart} 〜 {weekSummary.weekEnd}
          </p>
        </SectionCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="今日の日次入力"
          description="毎日の売上入力はここから行います。保存すると日次売上DBに記録され、週次集計も自動更新されます。"
        >
          <DailyInputForm defaultDate={todayInTokyo()} />
        </SectionCard>

        <SectionCard
          title="今週の実行項目"
          description="Notion に保存した今週の実行項目を表示し、必要に応じてエージェント提案を確認してから更新できます。"
        >
          <WeeklyActionsPanel
            initialPlan={weeklyActionPlan}
            weekStart={weekSummary.weekStart}
            weekEnd={weekSummary.weekEnd}
            enabled={agentChatEnabled}
            configReady={weeklyActionsConfigReady}
          />
        </SectionCard>

        <SectionCard
          title="プロジェクト状況"
          description="この内容は Notion のプロジェクトページ/DB とメモDBの最新内容から表示されます。対象案件のKPI目標と直近メモを見ながら、今週の意思決定を揃えます。"
        >
          <div className="grid gap-4">
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">案件名</p>
              <p className="mt-2 text-base font-semibold text-stone-900">{projectDisplayName}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">KPI目標</p>
              <p className="mt-2 text-sm leading-7 text-stone-700">{project.kpiTarget}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">最新メモ</p>
              <p className="mt-2 text-sm leading-7 text-stone-700">
                {latestMemo?.summary || "まだメモはありません。"}
              </p>
              <p className="mt-3 text-xs text-stone-500">
                更新: {latestMemo ? formatDateTime(latestMemo.updatedAt) : "未設定"}
              </p>
            </div>
          </div>
        </SectionCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_1fr_1.05fr]">
        <SectionCard
          title="今週見る数字"
          description="週次集計から主要KPIを確認できます。未入力の項目だけアラート表示します。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {metricAlerts.map((item) => (
              <div
                key={item.label}
                className={`rounded-2xl px-4 py-4 text-sm ${
                  item.status === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                <p className="font-semibold">{item.label}</p>
                <p className="mt-2 leading-6">{item.detail}</p>
              </div>
            ))}
          </div>
          <RefreshWeeklySummaryButton
            weekStart={weekSummary.weekStart}
            weekEnd={weekSummary.weekEnd}
          />
          <noscript>
            <a
              href={`/api/weekly-summary-action?weekStart=${weekSummary.weekStart}`}
              className="inline-flex w-fit rounded-full border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-medium text-blue-800"
            >
              週次集計を再計算（JS無効時用リンク）
            </a>
          </noscript>
        </SectionCard>

        <SectionCard
          title="今週の判断材料"
          description="最新メモをベースに表示しつつ、エージェント提案で今週の判断材料下書きを更新できます。"
        >
          <WeeklyJudgmentPanel
            weekStart={weekSummary.weekStart}
            weekEnd={weekSummary.weekEnd}
            enabled={agentChatEnabled}
            initialMaterial={judgmentMaterial}
            sourceLabel={judgmentSourceLabel}
            updatedAtLabel={judgmentMaterial ? formatDateTime(judgmentMaterial.updatedAt) : "未設定"}
          />
        </SectionCard>

        <SectionCard
          title="売上早見表"
          description="Notion を開かなくても、選択月の日次売上と週次売上、昨対比をまとめて確認できます。"
        >
          <SalesOverviewPanel entries={entries} />
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard
          title="AI運用アシスタント"
          description="ダッシュボード上の数字、メモ、週次レビューを前提に、そのまま相談できます。"
        >
          <DashboardAgentChat enabled={agentChatEnabled} />
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard
          title="エージェント呼び出しハブ"
          description="各エージェントに依頼内容を入力すると、ダッシュボード上の数字やメモを前提に回答やレポートを返します。"
        >
          <AgentRequestHub enabled={agentChatEnabled} agents={recommendedAgents} />
        </SectionCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="今週の実施ログ"
          description="今週入力した日次データを確認しながら、レビュー文面をその場でまとめられます。"
        >
          <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1">
            {currentDailyEntries.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                今週分の日次入力がまだありません。上の「今日の日次入力」から先に登録してください。
              </div>
            ) : (
              currentDailyEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-stone-900/10 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-stone-900">{entry.title}</p>
                    <p className="text-sm text-stone-500">{formatYen(entry.sales)}</p>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-stone-700">{entry.notes}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                    <p>客数 {formatCount(entry.customers)}</p>
                    <p>客単価 {formatYen(entry.averageSpend)}</p>
                    <p>粗利率 {formatPercentValue(entry.grossMarginRate)}</p>
                    <p>LINE登録数 {formatCount(entry.lineRegistrations)}</p>
                    <p>LINE経由来店数 {formatCount(entry.lineVisits)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="今週の週次レビュー入力"
          description={
            currentDraft
              ? "この週の保存済みレビューを読み込んでいます。更新すると同じ週の内容を上書きします。"
              : "今週の振り返りと来週の打ち手をここで保存します。"
          }
        >
          <WeeklyReviewForm
            weekStart={weekSummary.weekStart}
            weekEnd={weekSummary.weekEnd}
            initialDraft={currentDraft}
          />
        </SectionCard>

        <SectionCard
          title="直近の判断メモ"
          description="Notion を開かなくても直近メモを見返せるよう、必要な内容だけここに出します。下のフォームから直接追記もできます。"
        >
          <div className="grid gap-3">
            <DecisionMemoForm defaultTitle={`${weekSummary.weekStart} 判断メモ`} canWrite={canWriteMemo} />
            {memoEntries.length === 0 ? (
              <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                まだ判断メモはありません。
              </div>
            ) : (
              memoEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-[24px] border border-stone-900/10 bg-white px-5 py-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-stone-900">{entry.title}</p>
                      <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
                        Decision Memo
                      </p>
                    </div>
                    <p className="text-xs text-stone-500">{formatDateTime(entry.updatedAt)}</p>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl bg-stone-50 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-stone-400">要点</p>
                      <p className="mt-2 text-sm leading-7 text-stone-700">{entry.summary}</p>
                    </div>
                    {entry.nextAction ? (
                      <div className="rounded-2xl bg-stone-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
                          次アクション
                        </p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-600">
                          {entry.nextAction}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </SectionCard>
      </section>
      <footer className="mt-8 text-center text-xs text-stone-400">
        Build: {BUILD_TIMESTAMP} | Rendered: {new Date().toISOString()}
      </footer>
    </AppShell>
  );
}
