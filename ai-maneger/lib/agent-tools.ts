import {
  getKpiEntries,
  getLatestDecisionMemoEntries,
  getLatestWeeklyReviewEntries,
  getWeeklyActionPlan,
  saveDecisionMemo,
  saveWeeklyActionPlan,
} from "@/lib/notion/ootsuki";
import {
  aggregateWeek,
  attachWeekOverWeek,
  formatCount,
  formatPercentDelta,
  formatPercentValue,
  formatYen,
} from "@/lib/ootsuki";
import {
  buildYoYReportForMonth,
  fetchDailyYoYRows,
  resolveLatestMonthKey,
  type YoYReportSection,
} from "@/lib/notion/sales-yoy-context";
import {
  aggregateMonthlySalesFromKpiEntries,
  fetchMonthlySalesSummariesFromDb,
  formatMonthlySalesComparisonContext,
  PRIMARY_DAILY_SALES_DB_ID,
} from "@/lib/notion/sales-monthly-context";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_kpi_data",
      description:
        "直近の日次KPIデータ（売上・客数・客単価・粗利率・LINE登録数など）を取得する。今週と前週の集計も含む。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_monthly_sales_comparison",
      description:
        "日次売上Notion DBから月次集計を取得する。4月・5月など特定月の売上比較や前月比の確認に使う。",
      parameters: {
        type: "object",
        properties: {
          monthA: { type: "string", description: "比較元の月（例: 2026-04）" },
          monthB: { type: "string", description: "比較先の月（例: 2026-05）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_yoy_sales_report",
      description:
        "指定月の昨対比レポート（売上・客数・客単価の日別表、価格帯分布、差分分析）を日次売上Notion DBから取得する。5月の昨対比、客単価分析などに使う。",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "対象月（例: 2026-05）。省略時は最新月。" },
          section: {
            type: "string",
            enum: ["full", "sales", "average_spend", "price_band", "difference"],
            description:
              "full=全セクション, sales=売上昨対比, average_spend=客単価昨対比, price_band=価格帯分布, difference=客単価差分",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_action_plan",
      description: "今週の実行項目（アクションプラン）をNotionから取得する。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_decision_memos",
      description: "最新の判断メモをNotionから取得する。意思決定の経緯や次アクションが確認できる。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "取得件数（1〜10、省略時は5）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weekly_reviews",
      description: "最新の週次レビューをNotionから取得する。振り返り・課題・次アクションが確認できる。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "取得件数（1〜5、省略時は3）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_action_item",
      description:
        "今週のアクションプランに新しい実行項目を追加してNotionへ保存する。既存の項目に追記される。",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            description: "追加するアクション項目のリスト（例: [\"仕込み量を10%増やす\", \"LINE配信を水曜に実施\"]）",
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memo",
      description: "判断メモをNotionに新規保存する。重要な意思決定・気づき・方針を記録するときに使う。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "メモのタイトル" },
          summary: { type: "string", description: "要点・結論" },
          relatedNumbers: { type: "string", description: "関連数字（任意）" },
          nextAction: { type: "string", description: "次アクション（任意）" },
        },
        required: ["title", "summary"],
      },
    },
  },
];

function todayTokyoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentWeekRange() {
  const today = todayTokyoDate();
  // 月曜始まりの週範囲を計算
  const d = new Date(`${today}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0=Sun,1=Mon,...
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d.getTime() + diffToMon * 86400000);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  return {
    weekStart: mon.toISOString().slice(0, 10),
    weekEnd: sun.toISOString().slice(0, 10),
  };
}

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "get_kpi_data": {
      const entries = await getKpiEntries();
      const now = new Date();
      const currentWeek = aggregateWeek(entries, now);
      const previousWeek = aggregateWeek(
        entries,
        new Date(new Date(`${currentWeek.weekStart}T00:00:00.000Z`).getTime() - 86400000),
      );
      const summary = attachWeekOverWeek(currentWeek, previousWeek);
      const dailyLines = entries
        .filter((e) => e.weekStart === summary.weekStart)
        .slice(0, 7)
        .map(
          (e) =>
            `  ${e.title}: 売上${formatYen(e.sales)} 客数${formatCount(e.customers)} 客単価${formatYen(e.averageSpend)} 粗利率${formatPercentValue(e.grossMarginRate)} LINE登録${formatCount(e.lineRegistrations)} LINE来店${formatCount(e.lineVisits)}${e.notes ? ` メモ:${e.notes}` : ""}`,
        );
      return [
        `【今週集計】${summary.weekStart}〜${summary.weekEnd}`,
        `売上: ${formatYen(summary.sales)} (前週比 ${formatPercentDelta(summary.salesWoW)})`,
        `客数: ${formatCount(summary.customers)} (前週比 ${formatPercentDelta(summary.customersWoW)})`,
        `客単価: ${formatYen(summary.averageSpend)} (前週比 ${formatPercentDelta(summary.averageSpendWoW)})`,
        `粗利率: ${formatPercentValue(summary.grossMarginRate)} (前週比 ${formatPercentDelta(summary.grossMarginRateWoW)})`,
        `LINE登録: ${formatCount(summary.lineRegistrations)} (前週比 ${formatPercentDelta(summary.lineRegistrationsWoW)})`,
        `LINE来店: ${formatCount(summary.lineVisits)} (前週比 ${formatPercentDelta(summary.lineVisitsWoW)})`,
        `入力日数: ${summary.totalDays}`,
        "",
        "【今週の日次詳細】",
        ...dailyLines,
      ].join("\n");
    }

    case "get_monthly_sales_comparison": {
      const monthA = typeof args.monthA === "string" ? args.monthA.trim() : "";
      const monthB = typeof args.monthB === "string" ? args.monthB.trim() : "";

      let summaries;
      try {
        summaries = await fetchMonthlySalesSummariesFromDb(PRIMARY_DAILY_SALES_DB_ID);
      } catch {
        summaries = aggregateMonthlySalesFromKpiEntries(await getKpiEntries());
      }

      const context = formatMonthlySalesComparisonContext(summaries, {
        dbId: PRIMARY_DAILY_SALES_DB_ID,
        title: "【日次売上DB 月次集計】",
        detailMonthCount: 12,
      });

      const pick = (key: string) => summaries.find((m) => m.monthKey === key);

      if (monthA || monthB) {
        const a = monthA ? pick(monthA) : undefined;
        const b = monthB ? pick(monthB) : undefined;
        const compareLines = [
          monthA ? `${monthA}: ${a ? `売上 ${formatYen(a.sales)} / 客数 ${formatCount(a.customers)} / 客単価 ${formatYen(a.averageSpend)}` : "データなし"}` : "",
          monthB ? `${monthB}: ${b ? `売上 ${formatYen(b.sales)} / 客数 ${formatCount(b.customers)} / 客単価 ${formatYen(b.averageSpend)}` : "データなし"}` : "",
          a && b && a.sales > 0
            ? `差分: ${formatYen(b!.sales - a.sales)}（${monthA}→${monthB}）`
            : "",
        ].filter(Boolean);
        return [context, "", "【指定月の比較】", ...compareLines].join("\n");
      }

      return context;
    }

    case "get_yoy_sales_report": {
      const monthArg = typeof args.month === "string" ? args.month.trim() : "";
      const sectionRaw = typeof args.section === "string" ? args.section.trim() : "full";
      const section = (
        ["full", "sales", "average_spend", "price_band", "difference"].includes(sectionRaw)
          ? sectionRaw
          : "full"
      ) as YoYReportSection;

      const rows = await fetchDailyYoYRows(PRIMARY_DAILY_SALES_DB_ID);
      if (!rows.length) {
        return "日次売上DBからデータを取得できませんでした。";
      }

      const monthKey = monthArg || resolveLatestMonthKey(rows);
      const report = await buildYoYReportForMonth(monthKey, section, PRIMARY_DAILY_SALES_DB_ID);
      return [
        report,
        "",
        "【回答指示】上記の数値をそのまま使い、各セクション末尾に【所見】を3〜5行で付けること。",
      ].join("\n");
    }

    case "get_action_plan": {
      const { weekStart, weekEnd } = currentWeekRange();
      const plan = await getWeeklyActionPlan(weekStart, weekEnd);
      if (!plan || plan.actions.length === 0) {
        return `今週(${weekStart}〜${weekEnd})のアクションプランは未登録です。`;
      }
      return [
        `【今週のアクションプラン】${weekStart}〜${weekEnd}`,
        ...plan.actions.map((a) => `- ${a}`),
      ].join("\n");
    }

    case "get_decision_memos": {
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      const memos = await getLatestDecisionMemoEntries(limit);
      if (memos.length === 0) return "判断メモはまだ登録されていません。";
      return memos
        .map(
          (m) =>
            `[${m.updatedAt}] ${m.title}\n  要点: ${m.summary || "なし"}\n  関連数字: ${m.relatedNumbers || "なし"}\n  次アクション: ${m.nextAction || "なし"}`,
        )
        .join("\n\n");
    }

    case "get_weekly_reviews": {
      const limit = Math.min(5, Math.max(1, Number(args.limit) || 3));
      const reviews = await getLatestWeeklyReviewEntries(limit);
      if (reviews.length === 0) return "週次レビューはまだ登録されていません。";
      return reviews
        .map(
          (r) =>
            `[${r.updatedAt}] ${r.title}\n  振り返り: ${r.summary || "なし"}\n  関連数字: ${r.relatedNumbers || "なし"}\n  次アクション: ${r.nextAction || "なし"}`,
        )
        .join("\n\n");
    }

    case "create_action_item": {
      const newItems = Array.isArray(args.items)
        ? (args.items as string[]).filter((s) => typeof s === "string" && s.trim())
        : [];
      if (newItems.length === 0) return "追加するアクション項目がありません。";

      const { weekStart, weekEnd } = currentWeekRange();
      const existing = await getWeeklyActionPlan(weekStart, weekEnd);
      const merged = [...(existing?.actions ?? []), ...newItems];

      await saveWeeklyActionPlan({
        weekStart,
        weekEnd,
        actions: merged,
        source: "AIエージェント提案",
      });
      return `今週(${weekStart}〜${weekEnd})のアクションプランに${newItems.length}件を追加しました:\n${newItems.map((i) => `- ${i}`).join("\n")}`;
    }

    case "save_memo": {
      const title = typeof args.title === "string" ? args.title.trim() : "メモ";
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";
      if (!summary) return "summaryが空のためメモを保存できませんでした。";

      await saveDecisionMemo({
        title,
        summary,
        relatedNumbers: typeof args.relatedNumbers === "string" ? args.relatedNumbers : undefined,
        nextAction: typeof args.nextAction === "string" ? args.nextAction : undefined,
      });
      return `判断メモ「${title}」をNotionに保存しました。`;
    }

    default:
      return `ツール「${name}」は存在しません。`;
  }
}
