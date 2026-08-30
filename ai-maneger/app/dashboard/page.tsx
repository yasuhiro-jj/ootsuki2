import { AppShell } from "@/components/common/app-shell";
import { ErrorPanel } from "@/components/common/error-panel";
import { SectionCard } from "@/components/common/section-card";
import { DailyInputForm } from "@/components/ootsuki/daily-input-form";
import { AgentRequestHub } from "@/components/ootsuki/agent-request-hub";
import { DashboardAgentChat } from "@/components/ootsuki/dashboard-agent-chat";
import { DecisionMemoForm } from "@/components/ootsuki/decision-memo-form";
import { ProjectDirectionForm } from "@/components/ootsuki/project-direction-form";
import { WeeklyReviewForm } from "@/components/ootsuki/weekly-review-form";
import { RefreshWeeklySummaryButton } from "@/components/ootsuki/refresh-weekly-summary-button";
import { SalesOverviewPanel } from "@/components/ootsuki/sales-overview-panel";
import { UpdatedBanner } from "@/components/ootsuki/updated-banner";
import { WeeklyActionsPanel } from "@/components/ootsuki/weekly-actions-panel";
import { WeeklyJudgmentPanel } from "@/components/ootsuki/weekly-judgment-panel";
import { NotionInstructionsPanel } from "@/components/ootsuki/notion-instructions-panel";
import { UsenTimeZoneSalesPanel } from "@/components/ootsuki/usen-time-zone-sales-panel";
import { PosTimeZoneSalesPanel } from "@/components/ootsuki/pos-time-zone-sales-panel";
import { MarketingCommandCenter } from "@/components/ootsuki/marketing-command-center";
import { recommendedAgents } from "@/lib/agents";
import { getCurrentTenantAccessResult } from "@/lib/api/tenant-access";
import { formatDateTime } from "@/lib/format";
import { getIntegrationStatuses } from "@/lib/marketing/integration-status";
import { getMarketingMetricsSnapshot } from "@/lib/marketing/metrics";
import {
  buildFallbackMarketingStore,
  getOrCreateDefaultMarketingStore,
  listMarketingActions,
  listMarketingGoals,
} from "@/lib/marketing/repository";
import { isTenantConfigStoreEnabled } from "@/lib/tenant-config/repository";
import {
  aggregateMonthBusinessDays,
  aggregateMonthToDate,
  aggregateWeek,
  attachMonthOverMonth,
  attachMonthYearOverYear,
  attachWeekOverWeek,
  attachYearOverYear,
  buildMetricAlerts,
  buildProfitActionAlerts,
  calculateAverageSpend,
  formatCount,
  formatPercentDelta,
  formatPercentValue,
  formatYen,
  isWeeklySummaryEntry,
} from "@/lib/ootsuki";
import {
  getLatestDecisionMemoEntries,
  getKpiEntries,
  getLatestProjectDirectionEntries,
  getLatestStrategyMemo,
  getLatestWeeklyReviewEntries,
  getNotionInstructionsDocument,
  getOotsukiProjectOverview,
  getWeeklyActionPlan,
  getWeeklyReviewDraft,
} from "@/lib/notion/ootsuki";
import { getActiveTenantNotionConfig } from "@/lib/notion/tenant";

export const dynamic = "force-dynamic";

const BUILD_TIMESTAMP = "v2-20260412-2";

const dashboardAnchorItems = [
  { href: "#instructions", label: "運用指示書" },
  { href: "#monthly-kpis", label: "今月の数字" },
  { href: "#marketing-command", label: "マーケ施策司令塔" },
  { href: "#daily-input", label: "今日の日次入力" },
  { href: "#weekly-actions", label: "今週の実行項目" },
  { href: "#project-status", label: "プロジェクト状況" },
  { href: "#weekly-numbers", label: "今週見る数字" },
  { href: "#judgment-material", label: "今週の判断材料" },
  { href: "#sales-overview", label: "売上早見表" },
  { href: "#usen-time-zone", label: "USEN時間帯別売上" },
  { href: "#pos-time-zone", label: "POS時間帯別売上" },
  { href: "#profit-alerts", label: "利益アラート" },
  { href: "#ai-assistant", label: "AI運用アシスタント" },
  { href: "#agent-hub", label: "エージェント呼び出し" },
  { href: "#weekly-log", label: "今週の実施ログ" },
  { href: "#weekly-review", label: "週次レビュー入力" },
  { href: "#decision-memos", label: "直近の判断メモ" },
];

function todayInTokyo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function DashboardPage() {
  let access;
  try {
    access = await getCurrentTenantAccessResult("read");
  } catch (error) {
    access = {
      ok: false as const,
      status: 500,
      message: error instanceof Error ? error.message : "Failed to verify tenant access.",
      tenant: null,
      principalId: null,
    };
  }

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
    projectDirectionsResult,
    latestWeeklyReviewsResult,
    memoEntriesResult,
    instructionsResult,
  ] = await Promise.allSettled([
    getOotsukiProjectOverview(),
    getKpiEntries(),
    getLatestStrategyMemo(),
    getLatestProjectDirectionEntries(12),
    getLatestWeeklyReviewEntries(1),
    getLatestDecisionMemoEntries(5),
    getNotionInstructionsDocument(),
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
  const projectDirections =
    projectDirectionsResult.status === "fulfilled" ? projectDirectionsResult.value : [];
  const latestWeeklyReviews =
    latestWeeklyReviewsResult.status === "fulfilled" ? latestWeeklyReviewsResult.value : [];
  const memoEntries = memoEntriesResult.status === "fulfilled" ? memoEntriesResult.value : [];
  const instructionsDoc =
    instructionsResult.status === "fulfilled"
      ? instructionsResult.value
      : {
          configured: false,
          title: "運用指示書",
          body: "指示書の取得に失敗しました。しばらくしてから再読み込みしてください。",
          pageId: "",
        };
  const now = new Date();
  const currentWeek = aggregateWeek(entries, now);
  const previousWeek = aggregateWeek(
    entries,
    new Date(new Date(`${currentWeek.weekStart}T00:00:00.000Z`).getTime() - 86400000),
  );
  const lastYearDate = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  let sameWeekLastYear = aggregateWeek(entries, lastYearDate);
  const currentWeekDailyEntries = entries.filter(
    (entry) =>
      entry.date && entry.weekStart === currentWeek.weekStart && entry.weekEnd === currentWeek.weekEnd,
  );
  const lastYearFromPrevious = currentWeekDailyEntries.reduce(
    (acc, entry) => ({
      sales: acc.sales + (entry.previousSales ?? 0),
      customers: acc.customers + (entry.previousCustomers ?? 0),
    }),
    { sales: 0, customers: 0 },
  );
  if (
    (sameWeekLastYear.sales === 0 && lastYearFromPrevious.sales > 0) ||
    (sameWeekLastYear.customers === 0 && lastYearFromPrevious.customers > 0)
  ) {
    const mergedSales = sameWeekLastYear.sales || lastYearFromPrevious.sales;
    const mergedCustomers = sameWeekLastYear.customers || lastYearFromPrevious.customers;
    sameWeekLastYear = {
      ...sameWeekLastYear,
      sales: mergedSales,
      customers: mergedCustomers,
      averageSpend: calculateAverageSpend(mergedSales, mergedCustomers),
    };
  }
  const weekSummary = attachYearOverYear(attachWeekOverWeek(currentWeek, previousWeek), sameWeekLastYear);
  const currentMonth = aggregateMonthToDate(entries, now);
  const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonth = aggregateMonthBusinessDays(entries, previousMonthDate, currentMonth.totalDays);
  const lastYearMonthDate = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  let sameMonthLastYear = aggregateMonthBusinessDays(entries, lastYearMonthDate, currentMonth.totalDays);
  const currentMonthDailyEntries = entries.filter(
    (entry) => entry.date && entry.date >= currentMonth.monthStart && entry.date <= currentMonth.monthEnd,
  );
  const lastYearFromPreviousMonth = currentMonthDailyEntries.reduce(
    (acc, entry) => ({
      sales: acc.sales + (entry.previousSales ?? 0),
      customers: acc.customers + (entry.previousCustomers ?? 0),
    }),
    { sales: 0, customers: 0 },
  );
  if (lastYearFromPreviousMonth.sales > 0 || lastYearFromPreviousMonth.customers > 0) {
    const mergedSales = lastYearFromPreviousMonth.sales || sameMonthLastYear.sales;
    const mergedCustomers = lastYearFromPreviousMonth.customers || sameMonthLastYear.customers;
    sameMonthLastYear = {
      ...sameMonthLastYear,
      sales: mergedSales,
      customers: mergedCustomers,
      averageSpend: calculateAverageSpend(mergedSales, mergedCustomers),
    };
  }
  const monthSummary = attachMonthYearOverYear(
    attachMonthOverMonth(currentMonth, previousMonth),
    sameMonthLastYear,
  );
  const metricAlerts = buildMetricAlerts(monthSummary, "今月");
  const profitActionAlerts = buildProfitActionAlerts(monthSummary);
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
        Boolean(entry.date) &&
        entry.date! >= monthSummary.monthStart &&
        entry.date! <= monthSummary.monthEnd &&
        (entry.sales || 0) > 0,
    )
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const agentChatEnabled = Boolean(process.env.OPENAI_API_KEY?.trim());
  const marketingStoreResult = await Promise.allSettled([getOrCreateDefaultMarketingStore(access.tenant)]);
  const marketingStore =
    marketingStoreResult[0].status === "fulfilled"
      ? marketingStoreResult[0].value
      : buildFallbackMarketingStore(access.tenant);
  const [marketingMetricsResult, marketingActionsResult, marketingGoalsResult] = await Promise.allSettled([
    getMarketingMetricsSnapshot(marketingStore),
    listMarketingActions(access.tenant, 20, marketingStore.id),
    listMarketingGoals(access.tenant, marketingStore.id),
  ]);
  const marketingMetrics =
    marketingMetricsResult.status === "fulfilled" ? marketingMetricsResult.value : [];
  const marketingActions =
    marketingActionsResult.status === "fulfilled" ? marketingActionsResult.value : [];
  const marketingGoals =
    marketingGoalsResult.status === "fulfilled" ? marketingGoalsResult.value : [];
  const marketingIntegrationStatuses = await getIntegrationStatuses(marketingStore);
  const marketingStoreReady = isTenantConfigStoreEnabled();
  const activeTenantConfigResult = await Promise.allSettled([getActiveTenantNotionConfig()]);
  const activeTenantConfig =
    activeTenantConfigResult[0].status === "fulfilled" ? activeTenantConfigResult[0].value : null;
  const weeklyActionsConfigReady = Boolean(activeTenantConfig?.weeklyActionsDbId);
  const salesOverviewConfigReady = Boolean(activeTenantConfig?.dailySalesDbId && activeTenantConfig?.kpiDbId);
  const dashboardTitle = access.tenant === "demo" ? "デモダッシュボード" : "おおつき ダッシュボード";
  const projectDisplayName = access.tenant === "demo" ? "デモ店" : project.name;
  const canWriteMemo = access.role === "editor" || access.role === "admin" || access.role === "owner";

  return (
    <AppShell
      title={dashboardTitle}
      description="日次入力、今週の数字確認、週次レビュー、LINE配信文の確認までを一画面で回せる運用画面です。通常作業はこの画面を起点に進めます。"
      sectionNavItems={dashboardAnchorItems}
    >
      <UpdatedBanner />

      <section id="instructions" className="mt-4 scroll-mt-6">
        <SectionCard
          title="運用指示書"
          description="Notion の専用ページに書いた内容を表示します（1行目を見出し、2行目以降を本文として表示。LINE配信ページと同様にページ本文のブロックを読みます）。"
        >
          <NotionInstructionsPanel document={instructionsDoc} />
        </SectionCard>
      </section>

      <section id="monthly-kpis" className="grid scroll-mt-6 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SectionCard>
          <p className="text-sm text-stone-500">今月売上（累計）</p>
          <p className="mt-3 text-4xl font-bold">{formatYen(monthSummary.sales)}</p>
          <p className="mt-2 text-sm text-stone-500">
            昨対比 {formatPercentDelta(monthSummary.salesYoY)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-stone-500">今月客数（累計）</p>
          <p className="mt-3 text-4xl font-bold">{formatCount(monthSummary.customers)}</p>
          <p className="mt-2 text-sm text-stone-500">
            昨対比 {formatPercentDelta(monthSummary.customersYoY)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-stone-500">今月客単価</p>
          <p className="mt-3 text-4xl font-bold">{formatYen(monthSummary.averageSpend)}</p>
          <p className="mt-2 text-sm text-stone-500">
            昨対比 {formatPercentDelta(monthSummary.averageSpendYoY)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-stone-500">今月の入力済み日数</p>
          <p className="mt-3 text-4xl font-bold">{monthSummary.totalDays}</p>
          <p className="mt-2 text-sm text-stone-500">
            {monthSummary.monthStart} 〜 {monthSummary.monthEnd}
          </p>
        </SectionCard>
      </section>

      <section id="marketing-command" className="mt-6 scroll-mt-6">
        <SectionCard
          title="マーケティング施策司令塔"
          description="Instagram / Google Business Profileの主要指標をAIへ渡し、次に実行する施策をJSONで生成してAI Manager側に保存します。Canva、Instagram、GBPは既存アプリへ遷移する設計のまま維持します。"
        >
          <MarketingCommandCenter
            initialStore={marketingStore}
            initialGoals={marketingGoals}
            initialMetrics={marketingMetrics}
            initialActions={marketingActions}
            initialIntegrationStatuses={marketingIntegrationStatuses}
            enabled={agentChatEnabled}
            storeReady={marketingStoreReady}
          />
        </SectionCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          id="daily-input"
          className="scroll-mt-6"
          title="今日の日次入力"
          description="毎日の売上入力はここから行います。保存すると日次売上DBに記録され、週次集計も自動更新されます。"
        >
          <DailyInputForm defaultDate={todayInTokyo()} />
        </SectionCard>

        <SectionCard
          id="weekly-actions"
          className="scroll-mt-6"
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
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          id="project-status"
          className="scroll-mt-6"
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
            <ProjectDirectionForm defaultTitle={`${weekSummary.weekStart} プロジェクト方針`} canWrite={canWriteMemo} />
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-stone-900">保存済みのプロジェクト方針履歴</p>
              <p className="mt-1 text-xs text-stone-500">
                過去に保存した方針をこの画面で振り返れます。新しい順に表示しています。
              </p>
              <div className="mt-3 grid max-h-[300px] gap-3 overflow-y-auto pr-1">
                {projectDirections.length === 0 ? (
                  <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                    まだ保存されたプロジェクト方針はありません。
                  </div>
                ) : (
                  projectDirections.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-stone-900">{entry.title || "プロジェクト方針"}</p>
                        <p className="text-xs text-stone-500">{formatDateTime(entry.updatedAt)}</p>
                      </div>
                      <p className="mt-2 whitespace-pre-line leading-7 text-stone-700">{entry.summary || "（要点なし）"}</p>
                      {entry.relatedNumbers ? (
                        <p className="mt-2 whitespace-pre-line text-xs text-stone-600">
                          目標/KPI: {entry.relatedNumbers}
                        </p>
                      ) : null}
                      {entry.nextAction ? (
                        <p className="mt-1 whitespace-pre-line text-xs text-stone-600">
                          次アクション: {entry.nextAction}
                        </p>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="weekly-numbers"
          className="scroll-mt-6"
          title="今週見る数字"
          description="週次集計から主要KPIを確認できます。未入力の項目だけアラート表示します。"
        >
          <div className="grid gap-3">
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
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <SectionCard
          id="judgment-material"
          className="scroll-mt-6"
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
          id="sales-overview"
          className="scroll-mt-6"
          title="売上早見表"
          description="Notion を開かなくても、選択月の日次売上と週次売上、昨対比をまとめて確認できます。"
        >
          <SalesOverviewPanel
            entries={entries}
            configReady={salesOverviewConfigReady}
            tenant={access.tenant}
          />
        </SectionCard>
      </section>

      <section id="usen-time-zone" className="mt-6 scroll-mt-6">
        <SectionCard
          title="USEN時間帯別売上"
          description="USENレジの「注文客数の時間別推移」CSVを読み込み、時間帯別の合計とピークを確認できます。ログイン情報は保存せず、アップロードしたCSVだけをブラウザ内で解析します。"
        >
          <UsenTimeZoneSalesPanel />
        </SectionCard>
      </section>

      <section id="pos-time-zone" className="mt-6 scroll-mt-6">
        <SectionCard
          title="POS時間帯別 売上・客数"
          description="POSレジの時間帯別CSV（売上・客数）をアップロードし、時間帯別の合計と客単価（売上÷客数）を確認できます。"
        >
          <PosTimeZoneSalesPanel />
        </SectionCard>
      </section>

      <section id="profit-alerts" className="mt-6 scroll-mt-6">
        <SectionCard
          title="利益を残す施策アラート"
          description="粗利率・客単価・客数の前月比から、利益改善に直結する打ち手を自動提案します。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {profitActionAlerts.map((alert) => (
              <article
                key={alert.title}
                className={`rounded-2xl border px-4 py-4 ${
                  alert.status === "urgent"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : alert.status === "watch"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
              >
                <p className="text-sm font-semibold">{alert.title}</p>
                <p className="mt-2 text-sm leading-6">{alert.reason}</p>
                <div className="mt-3 grid gap-1 text-sm">
                  {alert.actions.map((action) => (
                    <p key={action}>- {action}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </section>

      <section id="ai-assistant" className="mt-6 scroll-mt-6">
        <SectionCard
          title="AI運用アシスタント"
          description="ダッシュボード上の数字、メモ、週次レビューを前提に、そのまま相談できます。"
        >
          <DashboardAgentChat enabled={agentChatEnabled} />
        </SectionCard>
      </section>

      <section id="agent-hub" className="mt-6 scroll-mt-6">
        <SectionCard
          title="エージェント呼び出しハブ"
          description="各エージェントに依頼内容を入力すると、ダッシュボード上の数字やメモを前提に回答やレポートを返します。"
        >
          <AgentRequestHub enabled={agentChatEnabled} agents={recommendedAgents} />
        </SectionCard>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          id="weekly-log"
          className="scroll-mt-6"
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
          id="weekly-review"
          className="scroll-mt-6"
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
          id="decision-memos"
          className="scroll-mt-6"
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
