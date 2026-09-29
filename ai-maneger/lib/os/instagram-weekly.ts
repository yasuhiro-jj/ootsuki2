import { num } from "@/lib/os/format";
import { clonePanelsForOverlay, pctChange, replacePanelMetric } from "@/lib/os/panel-overlay";
import type { Finding, OsDashboardData } from "@/types/os";

export type InstagramWeeklySnapshot = {
  fetchedAt: string;
  updatedAt: string;
  views30: number | null;
  viewsFollowerPct: number | null;
  viewsNonFollowerPct: number | null;
  viewers: number | null;
  interactions: number | null;
  interactionsFollowerPct: number | null;
  interactionsNonFollowerPct: number | null;
  accountsEngaged: number | null;
  profileViews: number | null;
  externalLinkTaps: number | null;
  addressTaps: number | null;
  followers: number | null;
  postViewPct: number | null;
  reelViewPct: number | null;
  storyViewPct: number | null;
  postDatesText: string;
  activeHoursText: string;
  source: string;
};

export type InstagramWeeklyPair = {
  latest: InstagramWeeklySnapshot;
  previous: InstagramWeeklySnapshot | null;
};

/** 投稿日リスト（カンマ・改行区切りの YYYY-MM-DD）をパースする。 */
export function parseInstagramPostDates(text: string) {
  const dates: string[] = [];
  for (const segment of text.split(/[\n,、]+/)) {
    const match = segment.trim().match(/(\d{4}-\d{2}-\d{2})/);
    if (match) dates.push(match[1]);
  }
  return [...new Set(dates)].sort();
}

export function daysSinceLastPost(postDates: string[], asOfIso: string) {
  if (postDates.length === 0) return null;
  const asOf = asOfIso.slice(0, 10);
  const last = postDates[postDates.length - 1];
  const diffMs = new Date(`${asOf}T12:00:00+09:00`).getTime() - new Date(`${last}T12:00:00+09:00`).getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/** 直近28日の投稿数から週あたり頻度を概算する。 */
export function postingFrequencyPerWeek(postDates: string[], asOfIso: string) {
  const asOf = asOfIso.slice(0, 10);
  const windowStart = new Date(`${asOf}T12:00:00+09:00`);
  windowStart.setDate(windowStart.getDate() - 28);
  const inWindow = postDates.filter((date) => {
    const t = new Date(`${date}T12:00:00+09:00`).getTime();
    return t >= windowStart.getTime();
  });
  if (inWindow.length === 0) return null;
  return (inWindow.length / 28) * 7;
}

function compactActiveHours(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 36) return trimmed;
  return `${trimmed.slice(0, 34)}…`;
}

export function buildInstagramFindings(snapshot: InstagramWeeklySnapshot, detectedAt: string): Finding[] {
  const findings: Finding[] = [];
  const postDates = parseInstagramPostDates(snapshot.postDatesText);
  const days = daysSinceLastPost(postDates, snapshot.fetchedAt);

  if (snapshot.viewsNonFollowerPct !== null && snapshot.viewsNonFollowerPct < 25) {
    findings.push({
      id: "ig-nonfollower-reach",
      agentKey: "sns",
      detectorKey: "ig_nonfollower_reach",
      kind: "problem",
      title: "新規リーチが弱い",
      severity: 3,
      evidence: [
        {
          metric: "閲覧（非フォロワー）",
          current: `${snapshot.viewsNonFollowerPct}%`,
          origin: "actual",
          source: snapshot.source,
        },
      ],
      detectedAt,
      status: "open",
      origin: "actual",
      source: "notion:instagram-weekly",
    });
  }

  if (snapshot.reelViewPct !== null && snapshot.reelViewPct < 15) {
    findings.push({
      id: "ig-reel-underuse",
      agentKey: "sns",
      detectorKey: "ig_reel_underuse",
      kind: "problem",
      title: "リール活用不足",
      severity: 3,
      evidence: [
        {
          metric: "リール閲覧比率",
          current: `${snapshot.reelViewPct}%`,
          origin: "actual",
          source: snapshot.source,
        },
      ],
      detectedAt,
      status: "open",
      origin: "actual",
      source: "notion:instagram-weekly",
    });
  }

  if (days !== null && days >= 7) {
    findings.push({
      id: "ig-post-stale",
      agentKey: "sns",
      detectorKey: "ig_post_stale",
      kind: "problem",
      title: "投稿が止まっている",
      severity: 4,
      evidence: [{ metric: "最終投稿から", current: `${days}日`, origin: "derived", source: "投稿日リスト" }],
      detectedAt,
      status: "open",
      origin: "derived",
      source: "notion:instagram-weekly",
    });
  }

  return findings;
}

/** Notion「おおつき Instagram週次DB」を Instagram パネルに載せる。 */
export function applyInstagramWeeklyOverlay(data: OsDashboardData, pair: InstagramWeeklyPair | null): OsDashboardData {
  if (!pair) return data;

  const { latest, previous } = pair;
  const next = clonePanelsForOverlay(data);
  const syncAt = latest.updatedAt || latest.fetchedAt;
  const postDates = parseInstagramPostDates(latest.postDatesText);
  const days = daysSinceLastPost(postDates, latest.fetchedAt);
  const freq = postingFrequencyPerWeek(postDates, latest.fetchedAt);

  if (latest.views30 !== null) {
    replacePanelMetric(next, "instagram", "views30", {
      label: "閲覧数（30日）",
      value: num(latest.views30),
      sub:
        latest.viewsFollowerPct !== null && latest.viewsNonFollowerPct !== null
          ? `フォロワー ${latest.viewsFollowerPct}% / 他 ${latest.viewsNonFollowerPct}%`
          : undefined,
      delta:
        previous?.views30 !== null && previous?.views30 !== undefined && latest.views30 !== null
          ? pctChange(latest.views30, previous.views30)
          : undefined,
      deltaLabel: previous?.views30 != null ? "前回比" : undefined,
      goodWhen: "up",
      origin: "actual",
    });
  }

  if (latest.viewers !== null) {
    replacePanelMetric(next, "instagram", "viewers", {
      label: "閲覧者数",
      value: num(latest.viewers),
      delta:
        previous?.viewers != null && latest.viewers != null ? pctChange(latest.viewers, previous.viewers) : undefined,
      deltaLabel: previous?.viewers != null ? "前回比" : undefined,
      goodWhen: "up",
      origin: "actual",
    });
  }

  if (latest.interactions !== null) {
    replacePanelMetric(next, "instagram", "interactions", {
      label: "インタラクション",
      value: num(latest.interactions),
      sub:
        latest.interactionsFollowerPct !== null && latest.interactionsNonFollowerPct !== null
          ? `フォロワー ${latest.interactionsFollowerPct}% / 他 ${latest.interactionsNonFollowerPct}%`
          : undefined,
      delta:
        previous?.interactions != null && latest.interactions != null
          ? pctChange(latest.interactions, previous.interactions)
          : undefined,
      deltaLabel: previous?.interactions != null ? "前回比" : undefined,
      goodWhen: "up",
      origin: "actual",
    });
  }

  if (latest.accountsEngaged !== null) {
    replacePanelMetric(next, "instagram", "accounts", {
      label: "アクションを実行したアカウント",
      value: num(latest.accountsEngaged),
      origin: "actual",
    });
  }

  if (latest.profileViews !== null) {
    replacePanelMetric(next, "instagram", "profile", {
      label: "プロフィールアクセス",
      value: num(latest.profileViews),
      sub:
        latest.externalLinkTaps !== null || latest.addressTaps !== null
          ? `外部リンク ${latest.externalLinkTaps ?? 0} / 住所 ${latest.addressTaps ?? 0}`
          : undefined,
      origin: "actual",
    });
  }

  if (latest.followers !== null) {
    replacePanelMetric(next, "instagram", "fo", {
      label: "フォロワー",
      value: `${num(latest.followers)}人`,
      delta:
        previous?.followers != null && latest.followers != null ? pctChange(latest.followers, previous.followers) : undefined,
      deltaLabel: previous?.followers != null ? "前回比" : undefined,
      goodWhen: "up",
      origin: "actual",
    });
  }

  if (latest.postViewPct !== null && latest.reelViewPct !== null && latest.storyViewPct !== null) {
    replacePanelMetric(next, "instagram", "contentMix", {
      label: "コンテンツ別閲覧比率",
      value: `投稿 ${latest.postViewPct}%`,
      sub: `リール ${latest.reelViewPct}% / ST ${latest.storyViewPct}%`,
      origin: "actual",
    });
  }

  if (days !== null) {
    replacePanelMetric(next, "instagram", "d", {
      label: "最終投稿から",
      value: `${days}日`,
      goodWhen: "down",
      origin: "derived",
    });
  }

  if (freq !== null) {
    replacePanelMetric(next, "instagram", "f", {
      label: "投稿頻度",
      value: `週${freq.toFixed(1)}回`,
      sub: postDates.length > 0 ? `直近28日 ${parseInstagramPostDates(latest.postDatesText).length}投稿` : undefined,
      origin: "derived",
    });
  }

  if (latest.activeHoursText.trim()) {
    replacePanelMetric(next, "instagram", "activeHours", {
      label: "最もアクティブな時間帯",
      value: compactActiveHours(latest.activeHoursText),
      sub: "フォロワー（Instagramインサイト）",
      origin: "actual",
    });
  }

  const findings = buildInstagramFindings(latest, syncAt);
  next.panels = next.panels.map((panel) =>
    panel.key === "instagram"
      ? {
          ...panel,
          status: "manual",
          statusNote: "Notion 週次入力（将来: Instagram Graph API に差し替え）",
          updatedAt: syncAt,
          findings: [...findings, ...panel.findings.filter((f) => !f.id.startsWith("ig-"))],
        }
      : panel,
  );

  next.connectors = next.connectors.map((connector) =>
    connector.key === "instagram"
      ? {
          ...connector,
          status: "manual",
          via: "Notion おおつき Instagram週次DB",
          lastSyncAt: syncAt,
          note: "Meta インサイト API 接続後に自動取得へ切替可能",
        }
      : connector,
  );

  next.agents = next.agents.map((agent) =>
    agent.key === "sns" ? { ...agent, state: "ok", lastRunAt: syncAt, findingsCount: Math.max(findings.length, 1) } : agent,
  );

  return next;
}
