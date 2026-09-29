import { num } from "@/lib/os/format";
import { clonePanelsForOverlay, pctChange, replacePanelMetric } from "@/lib/os/panel-overlay";
import type { OsDashboardData } from "@/types/os";

export type LineKpiSnapshot = {
  fetchedAt: string;
  updatedAt: string;
  friends: number | null;
  previousFriends: number | null;
  dormant90: number | null;
  lastBroadcastDate: string | null;
  openRate: number | null;
  openCount: number | null;
  lineVisits7d: number | null;
  previousLineVisits7d: number | null;
  memo: string;
  source: string;
};

const PROLINE_FRIENDS_HINT =
  "友だち数はプロライン（autosns.jp）管理画面ヘッダーの表示値です。LINE公式アカウント管理画面の友だち総数ではありません。";

function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function isProlineFriends(snapshot: LineKpiSnapshot) {
  return /プロライン/.test(snapshot.memo) || /プロライン/.test(snapshot.source);
}

function clearLineMetric(data: OsDashboardData, metricKey: string) {
  replacePanelMetric(data, "line", metricKey, {
    value: "未取得",
    sub: undefined,
    hint: undefined,
    delta: undefined,
    deltaLabel: undefined,
    origin: "unavailable",
  });
}

/** Notion「おおつき LINE KPI DB」の最新行を LINE パネルに載せる。 */
export function applyLineKpiOverlay(data: OsDashboardData, snapshot: LineKpiSnapshot | null): OsDashboardData {
  if (!snapshot) return data;

  const next = clonePanelsForOverlay(data);
  const syncAt = snapshot.updatedAt || snapshot.fetchedAt;
  const proline = isProlineFriends(snapshot);

  if (snapshot.friends !== null) {
    replacePanelMetric(next, "line", "fr", {
      label: "友だち数",
      value: `${num(snapshot.friends)}人`,
      sub: proline ? "プロライン表示" : undefined,
      hint: proline ? PROLINE_FRIENDS_HINT : undefined,
      origin: "actual",
      delta:
        snapshot.previousFriends !== null
          ? pctChange(snapshot.friends, snapshot.previousFriends)
          : undefined,
      deltaLabel: snapshot.previousFriends !== null ? "前週比" : undefined,
      goodWhen: "up",
    });
  } else {
    clearLineMetric(next, "fr");
  }

  if (snapshot.lastBroadcastDate) {
    replacePanelMetric(next, "line", "last", {
      label: "最終配信",
      value: shortDate(snapshot.lastBroadcastDate),
      origin: "actual",
      sub: undefined,
      hint: undefined,
    });
  } else {
    clearLineMetric(next, "last");
  }

  if (snapshot.openRate !== null) {
    replacePanelMetric(next, "line", "open", {
      label: "開封率",
      value: `${snapshot.openRate.toFixed(1)}%`,
      sub: snapshot.openCount !== null ? `開封 ${num(snapshot.openCount)}` : undefined,
      origin: "actual",
    });
  } else if (snapshot.openCount !== null) {
    replacePanelMetric(next, "line", "open", {
      label: "開封数",
      value: num(snapshot.openCount),
      origin: "actual",
    });
  } else {
    clearLineMetric(next, "open");
  }

  if (snapshot.lineVisits7d !== null) {
    replacePanelMetric(next, "line", "lv", {
      label: "LINE経由来店（7日）",
      value: `${num(snapshot.lineVisits7d)}人`,
      origin: "actual",
      delta:
        snapshot.previousLineVisits7d !== null
          ? pctChange(snapshot.lineVisits7d, snapshot.previousLineVisits7d)
          : undefined,
      deltaLabel: snapshot.previousLineVisits7d !== null ? "前週比" : undefined,
      goodWhen: "up",
    });
  } else {
    clearLineMetric(next, "lv");
  }

  if (snapshot.dormant90 !== null) {
    replacePanelMetric(next, "line", "dm", {
      label: "休眠顧客（90日+）",
      value: `${num(snapshot.dormant90)}人`,
      origin: "actual",
    });
  } else {
    clearLineMetric(next, "dm");
  }

  next.panels = next.panels.map((panel) =>
    panel.key === "line"
      ? {
          ...panel,
          status: "grok_bot",
          statusNote: "Grok Bot → Notion（プロライン/LINE KPI・シナリオ）",
          updatedAt: syncAt,
        }
      : panel,
  );

  next.connectors = next.connectors.map((connector) =>
    connector.key === "line"
      ? {
          ...connector,
          status: "grok_bot",
          via: "Grok Bot → Notion LINE KPI",
          lastSyncAt: syncAt,
          note: proline ? "友だち数はプロライン画面の表示値" : undefined,
        }
      : connector,
  );

  return next;
}
