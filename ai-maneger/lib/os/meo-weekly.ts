import { num } from "@/lib/os/format";
import { clonePanelsForOverlay, pctChange, replacePanelMetric } from "@/lib/os/panel-overlay";
import type { Finding, OsDashboardData } from "@/types/os";

export type MeoWeeklySnapshot = {
  fetchedAt: string;
  updatedAt: string;
  rating: number | null;
  reviewCount: number | null;
  lowRating30d: number | null;
  lowRatingDetail: string;
  unreplied: number | null;
  impressions: number | null;
  prevImpressions: number | null;
  routeSearches: number | null;
  phoneTaps: number | null;
  siteClicks: number | null;
  displayMonth: string;
  meoScore: number | null;
  profileDiagnosis: number | null;
  rankKeyword: string;
  rankPosition: number | null;
  rankLeader: string;
  source: string;
};

export type MeoWeeklyPair = {
  latest: MeoWeeklySnapshot;
  previous: MeoWeeklySnapshot | null;
};

export function buildMeoFindings(snapshot: MeoWeeklySnapshot, detectedAt: string): Finding[] {
  const findings: Finding[] = [];

  if (snapshot.unreplied !== null && snapshot.unreplied >= 5) {
    findings.push({
      id: "meo-unreplied",
      agentKey: "acquisition",
      detectorKey: "meo_unreplied_reviews",
      kind: "problem",
      title: "未返信口コミあり",
      severity: 4,
      evidence: [{ metric: "未返信", current: snapshot.unreplied, origin: "actual", source: snapshot.source }],
      detectedAt,
      status: "open",
      origin: "actual",
      source: "notion:meo-weekly",
    });
  }

  if (snapshot.lowRating30d !== null && snapshot.lowRating30d >= 2) {
    findings.push({
      id: "meo-low-ratings",
      agentKey: "acquisition",
      detectorKey: "meo_low_ratings",
      kind: "problem",
      title: "低評価が続いている",
      severity: 4,
      evidence: [
        {
          metric: "直近30日の★1〜2",
          current: `${snapshot.lowRating30d}件`,
          origin: "actual",
          source: snapshot.lowRatingDetail || snapshot.source,
        },
      ],
      detectedAt,
      status: "open",
      origin: "actual",
      source: "notion:meo-weekly",
    });
  }

  return findings;
}

/** Notion「おおつき MEO週次DB」を MEO パネルに載せる（GBP API 未取得時の手入力表示）。 */
export function applyMeoWeeklyOverlay(data: OsDashboardData, pair: MeoWeeklyPair | null): OsDashboardData {
  if (!pair) return data;

  const { latest, previous } = pair;
  const next = clonePanelsForOverlay(data);
  const syncAt = latest.updatedAt || latest.fetchedAt;
  const impressionDelta =
    latest.impressions !== null && latest.prevImpressions !== null ? latest.impressions - latest.prevImpressions : null;

  if (latest.rating !== null) {
    replacePanelMetric(next, "meo", "r", {
      label: "口コミ評価",
      value: `${latest.rating.toFixed(1)} ★`,
      sub: latest.reviewCount !== null ? `口コミ ${num(latest.reviewCount)}件` : undefined,
      delta:
        previous?.rating != null && latest.rating != null ? pctChange(latest.rating, previous.rating) : undefined,
      deltaLabel: previous?.rating != null ? "前回比" : undefined,
      goodWhen: "up",
      origin: "actual",
    });
  }

  if (latest.lowRating30d !== null) {
    replacePanelMetric(next, "meo", "low", {
      label: "新着低評価",
      value: `直近30日 ${latest.lowRating30d}件`,
      sub: latest.lowRatingDetail || undefined,
      goodWhen: "down",
      origin: "actual",
    });
  }

  if (latest.unreplied !== null) {
    replacePanelMetric(next, "meo", "nr", {
      label: "未返信",
      value: `${num(latest.unreplied)}件`,
      sub: "返信下書きあり・承認待ち",
      goodWhen: "down",
      origin: "actual",
    });
  }

  if (latest.impressions !== null || latest.routeSearches !== null) {
    replacePanelMetric(next, "meo", "v", {
      label: "表示 / 経路検索",
      value: `${latest.impressions !== null ? num(latest.impressions) : "—"} / ${latest.routeSearches !== null ? num(latest.routeSearches) : "—"}`,
      sub: [
        "推定",
        latest.displayMonth || undefined,
        latest.phoneTaps !== null || latest.siteClicks !== null
          ? `電話 ${latest.phoneTaps ?? "—"}・サイト ${latest.siteClicks ?? "—"}`
          : undefined,
        impressionDelta !== null ? `表示 前月比 ${impressionDelta >= 0 ? "+" : ""}${num(impressionDelta)}` : undefined,
      ]
        .filter(Boolean)
        .join("・"),
      origin: "derived",
    });
  }

  if (latest.meoScore !== null) {
    replacePanelMetric(next, "meo", "score", {
      label: "MEOスコア",
      value: String(latest.meoScore),
      delta:
        previous?.meoScore != null && latest.meoScore != null ? pctChange(latest.meoScore, previous.meoScore) : undefined,
      deltaLabel: previous?.meoScore != null ? "前回比" : undefined,
      goodWhen: "up",
      origin: "actual",
    });
  }

  if (latest.profileDiagnosis !== null) {
    replacePanelMetric(next, "meo", "diag", {
      label: "プロフィール診断",
      value: `${latest.profileDiagnosis}/100`,
      origin: "actual",
    });
  }

  if (latest.rankPosition !== null && latest.rankKeyword) {
    replacePanelMetric(next, "meo", "rank", {
      label: "順位",
      value: `${latest.rankKeyword} ${latest.rankPosition}位`,
      sub: latest.rankLeader ? `1位 ${latest.rankLeader}` : undefined,
      goodWhen: "down",
      origin: "actual",
    });
  }

  const findings = buildMeoFindings(latest, syncAt);
  next.panels = next.panels.map((panel) =>
    panel.key === "meo"
      ? {
          ...panel,
          status: "connected",
          statusNote: "MEO Auto Assistant → Notion 週次（表示/経路は推定・GBP API 接続後に自動化）",
          updatedAt: syncAt,
          findings: [...findings, ...panel.findings.filter((f) => !f.id.startsWith("meo-"))],
        }
      : panel,
  );

  next.connectors = next.connectors.map((connector) =>
    connector.key === "gbp"
      ? {
          ...connector,
          status: "connected",
          via: "Notion MEO週次 + meo内部API（指標は手入力優先）",
          lastSyncAt: syncAt,
          note: "GBP Performance API 取得後は API 値を優先",
        }
      : connector,
  );

  next.agents = next.agents.map((agent) =>
    agent.key === "acquisition"
      ? { ...agent, state: "ok", lastRunAt: syncAt, findingsCount: Math.max(findings.length, 1) }
      : agent,
  );

  return next;
}
