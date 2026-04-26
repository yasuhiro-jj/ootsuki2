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
