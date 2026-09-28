import type { Finding, OsDashboardData } from "@/types/os";

export type WebAnalyticsSnapshot = {
  target: "gsc" | "ga4";
  weekStart: string;
  weekEnd: string;
  site: string;
  source: string;
  fetchedAt: string;
  clicks?: number;
  impressions?: number;
  avgPosition?: number;
  prevClicks?: number;
  prevImpressions?: number;
  prevAvgPosition?: number;
  rankDropsText?: string;
  sessions?: number;
  users?: number;
  menuViews?: number;
  telTaps?: number;
  prevSessions?: number;
  prevUsers?: number;
  prevMenuViews?: number;
  prevTelTaps?: number;
};

export type WebAnalyticsBundle = {
  gsc: WebAnalyticsSnapshot | null;
  ga4: WebAnalyticsSnapshot | null;
};

function pctChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function shortRange(start: string, end: string) {
  const fmt = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${Number(month)}/${Number(day)}`;
  };
  return `${fmt(start)}〜${fmt(end)}`;
}

function parseRankDropSegment(trimmed: string) {
  const bullet = trimmed.replace(/^[・•\-\s]+/, "").trim();
  if (!bullet) return null;
  let matched = bullet.match(/^(.+?)[\s　]+(\d+(?:\.\d+)?)[／/](\d+(?:\.\d+)?)[／/](\d+)/);
  if (!matched) {
    matched = bullet.match(/^(.+?)（今(\d+(?:\.\d+)?)／前(\d+(?:\.\d+)?)／クリック(\d+)）/);
  }
  if (!matched) return null;
  return {
    query: matched[1].trim(),
    current: Number(matched[2]),
    previous: Number(matched[3]),
    clicks: Number(matched[4]),
  };
}

/** Notion の「順位が落ちた検索語」テキストをパースする（改行・読点区切り両対応）。 */
export function parseRankDropLines(text: string) {
  const rows: { query: string; current: number; previous: number; clicks: number }[] = [];
  for (const segment of text.split(/[\n、,]+/)) {
    const parsed = parseRankDropSegment(segment);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

function worstRankDrop(text: string | undefined) {
  const rows = parseRankDropLines(text || "");
  if (rows.length === 0) return null;
  return [...rows].sort((left, right) => right.current - right.previous - (left.current - left.previous))[0];
}

function replacePanelMetric(
  data: OsDashboardData,
  panelKey: string,
  metricKey: string,
  patch: Partial<OsDashboardData["kpis"][number]>,
) {
  data.panels = data.panels.map((panel) =>
    panel.key === panelKey
      ? { ...panel, metrics: panel.metrics.map((metric) => (metric.key === metricKey ? { ...metric, ...patch } : metric)) }
      : panel,
  );
}

function seoFindingFromGsc(gsc: WebAnalyticsSnapshot, generatedAt: string): Finding | null {
  const drop = worstRankDrop(gsc.rankDropsText);
  if (!drop) return null;
  return {
    id: "gsc-rank-drop",
    agentKey: "seo",
    detectorKey: "gsc_rank_drop",
    kind: "problem",
    title: `「${drop.query}」${drop.previous}→${drop.current}位`,
    severity: drop.current - drop.previous >= 30 ? 4 : 3,
    evidence: [
      {
        metric: "クリック（7日）",
        current: drop.clicks,
        origin: "actual",
        source: gsc.source || "Notion 検索・アクセス",
      },
    ],
    detectedAt: generatedAt,
    status: "open",
    origin: "actual",
    source: "grok_bot:search-console",
  };
}

/** Notion の検索・アクセス2行を SEO / GA4 パネルとコネクタに載せる。 */
export function applyWebAnalyticsOverlays(data: OsDashboardData, bundle: WebAnalyticsBundle): OsDashboardData {
  const { gsc, ga4 } = bundle;
  if (!gsc && !ga4) return data;

  const generatedAt = gsc?.fetchedAt || ga4?.fetchedAt || data.generatedAt;
  const next: OsDashboardData = {
    ...data,
    generatedAt,
    panels: data.panels.map((panel) => ({
      ...panel,
      metrics: panel.metrics.map((metric) => ({ ...metric })),
      findings: [...panel.findings],
    })),
    connectors: data.connectors.map((connector) => ({ ...connector })),
    grokBots: data.grokBots.map((bot) => ({ ...bot })),
    agents: data.agents.map((agent) => ({ ...agent })),
  };

  if (gsc) {
    const period = shortRange(gsc.weekStart, gsc.weekEnd);
    replacePanelMetric(next, "seo", "cl", {
      label: "クリック（7日）",
      value: `${Math.round(gsc.clicks ?? 0).toLocaleString("ja-JP")}`,
      sub: period,
      delta: gsc.clicks !== undefined && gsc.prevClicks !== undefined ? pctChange(gsc.clicks, gsc.prevClicks) : undefined,
      deltaLabel: "前の7日比",
      goodWhen: "up",
      origin: "actual",
    });
    replacePanelMetric(next, "seo", "im", {
      label: "表示回数（7日）",
      value: `${Math.round(gsc.impressions ?? 0).toLocaleString("ja-JP")}`,
      sub: gsc.site || "fuji-ootsuki.com",
      delta:
        gsc.impressions !== undefined && gsc.prevImpressions !== undefined
          ? pctChange(gsc.impressions, gsc.prevImpressions)
          : undefined,
      deltaLabel: "前の7日比",
      goodWhen: "up",
      origin: "actual",
    });
    replacePanelMetric(next, "seo", "pos", {
      label: "平均順位",
      value: `${(gsc.avgPosition ?? 0).toFixed(1)}`,
      sub: gsc.prevAvgPosition !== undefined ? `前の7日 ${gsc.prevAvgPosition.toFixed(1)}` : undefined,
      origin: "actual",
      goodWhen: "down",
    });
    const drops = parseRankDropLines(gsc.rankDropsText || "");
    replacePanelMetric(next, "seo", "drop", {
      label: "順位低下クエリ",
      value: drops.length > 0 ? `${drops.length}件` : "0件",
      sub: drops.length > 0 ? drops[0].query : undefined,
      goodWhen: "down",
      origin: "actual",
    });
    next.panels = next.panels.map((panel) => {
      if (panel.key !== "seo") return panel;
      const finding = seoFindingFromGsc(gsc, generatedAt);
      const rest = panel.findings.filter((item) => item.id !== "f5" && item.id !== "gsc-rank-drop");
      return {
        ...panel,
        status: "grok_bot",
        statusNote: "Grok Bot → Notion 検索・アクセス（サーチコンソール）",
        updatedAt: generatedAt,
        findings: finding ? [finding, ...rest] : rest,
      };
    });
  }

  if (ga4) {
    const period = shortRange(ga4.weekStart, ga4.weekEnd);
    replacePanelMetric(next, "ga4", "s", {
      label: "セッション（7日）",
      value: `${Math.round(ga4.sessions ?? 0).toLocaleString("ja-JP")}`,
      sub: period,
      delta: ga4.sessions !== undefined && ga4.prevSessions !== undefined ? pctChange(ga4.sessions, ga4.prevSessions) : undefined,
      deltaLabel: "前の7日比",
      goodWhen: "up",
      origin: "actual",
    });
    replacePanelMetric(next, "ga4", "u", {
      label: "ユーザー",
      value: `${Math.round(ga4.users ?? 0).toLocaleString("ja-JP")}`,
      sub: ga4.prevUsers !== undefined ? `前の7日 ${Math.round(ga4.prevUsers).toLocaleString("ja-JP")}` : undefined,
      origin: "actual",
    });
    replacePanelMetric(next, "ga4", "menu", {
      label: "メニュー閲覧",
      value: `${Math.round(ga4.menuViews ?? 0).toLocaleString("ja-JP")}`,
      sub: "/menu/ のページビュー",
      delta:
        ga4.menuViews !== undefined && ga4.prevMenuViews !== undefined ? pctChange(ga4.menuViews, ga4.prevMenuViews) : undefined,
      deltaLabel: "前の7日比",
      goodWhen: "up",
      origin: "actual",
    });
    replacePanelMetric(next, "ga4", "tel", {
      label: "電話タップ",
      value: `${Math.round(ga4.telTaps ?? 0).toLocaleString("ja-JP")}`,
      sub: "cv_tel イベント",
      delta: ga4.telTaps !== undefined && ga4.prevTelTaps !== undefined ? pctChange(ga4.telTaps, ga4.prevTelTaps) : undefined,
      deltaLabel: "前の7日比",
      goodWhen: "up",
      origin: "actual",
    });
    next.panels = next.panels.map((panel) =>
      panel.key === "ga4"
        ? {
            ...panel,
            status: "grok_bot",
            statusNote: "Grok Bot → Notion 検索・アクセス（アナリティクス）",
            updatedAt: generatedAt,
          }
        : panel,
    );
  }

  const syncAt = generatedAt;
  next.connectors = next.connectors.map((connector) => {
    if (gsc && connector.key === "gsc") {
      return {
        ...connector,
        status: "grok_bot",
        via: "Grok Bot → Notion 検索・アクセス",
        lastSyncAt: syncAt,
      };
    }
    if (ga4 && connector.key === "ga4") {
      return {
        ...connector,
        status: "grok_bot",
        via: "Grok Bot → Notion 検索・アクセス",
        lastSyncAt: syncAt,
      };
    }
    return connector;
  });

  if (gsc || ga4) {
    next.grokBots = next.grokBots.map((bot) =>
      bot.key === "search_console_bot"
        ? {
            ...bot,
            state: "ok",
            lastIngestAt: syncAt,
            findingsCount: gsc ? parseRankDropLines(gsc.rankDropsText || "").length : bot.findingsCount,
          }
        : bot,
    );
    next.agents = next.agents.map((agent) =>
      agent.key === "seo" && gsc
        ? { ...agent, state: "ok", lastRunAt: syncAt, findingsCount: Math.max(1, parseRankDropLines(gsc.rankDropsText || "").length) }
        : agent,
    );
  }

  return next;
}
