import assert from "node:assert/strict";
import test from "node:test";
import { osSampleData } from "../mock/os-sample";
import {
  applyInstagramWeeklyOverlay,
  buildInstagramFindings,
  daysSinceLastPost,
  parseInstagramPostDates,
  postingFrequencyPerWeek,
} from "../lib/os/instagram-weekly";
import { applyMeoWeeklyOverlay, buildMeoFindings } from "../lib/os/meo-weekly";
import { scrubUnconnectedSamples } from "../lib/os/live-mode";

const instagramSnapshot = {
  fetchedAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T00:22:00.000Z",
  views30: 10000,
  viewsFollowerPct: 80.7,
  viewsNonFollowerPct: 19.3,
  viewers: 814,
  interactions: 601,
  interactionsFollowerPct: 93,
  interactionsNonFollowerPct: 7,
  accountsEngaged: 84,
  profileViews: 205,
  externalLinkTaps: 4,
  addressTaps: 2,
  followers: 731,
  postViewPct: 88.7,
  reelViewPct: 6.1,
  storyViewPct: 5.1,
  postDatesText: "2026-09-23, 2026-09-16, 2026-09-09",
  activeHoursText: "0時153, 3時168",
  source: "テスト",
};

const meoSnapshot = {
  fetchedAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T00:22:00.000Z",
  rating: 3.6,
  reviewCount: 55,
  lowRating30d: 3,
  lowRatingDetail: "★1: 9/22",
  unreplied: 13,
  impressions: 1030,
  prevImpressions: 1720,
  routeSearches: 163,
  phoneTaps: 89,
  siteClicks: 134,
  displayMonth: "2026年8月",
  meoScore: 32,
  profileDiagnosis: 43,
  rankKeyword: "富士市 食事 ランチ",
  rankPosition: 14,
  rankLeader: "ごはんや よつは",
  source: "テスト",
};

test("投稿日から最終投稿・頻度を計算する", () => {
  const dates = parseInstagramPostDates("2026-09-23, 2026-09-16");
  assert.equal(daysSinceLastPost(dates, "2026-09-29"), 6);
  const freq = postingFrequencyPerWeek(dates, "2026-09-29");
  assert.ok(freq !== null && freq > 0);
});

test("Instagram 週次をパネルに載せ、発見ルールを満たす", () => {
  const findings = buildInstagramFindings(instagramSnapshot, instagramSnapshot.updatedAt);
  assert.ok(findings.some((f) => f.title === "新規リーチが弱い"));
  assert.ok(findings.some((f) => f.title === "リール活用不足"));
  assert.equal(findings.some((f) => f.title === "投稿が止まっている"), false);

  const applied = applyInstagramWeeklyOverlay(osSampleData, { latest: instagramSnapshot, previous: null });
  const panel = applied.panels.find((p) => p.key === "instagram");
  assert.equal(panel?.status, "manual");
  assert.equal(panel?.metrics.find((m) => m.key === "views30")?.value, "10,000");
  assert.equal(panel?.metrics.find((m) => m.key === "fo")?.value, "731人");
});

test("MEO 週次をパネルに載せ、未返信・低評価の発見を出す", () => {
  const findings = buildMeoFindings(meoSnapshot, meoSnapshot.updatedAt);
  assert.ok(findings.some((f) => f.title === "未返信口コミあり"));
  assert.ok(findings.some((f) => f.title === "低評価が続いている"));

  const applied = applyMeoWeeklyOverlay(osSampleData, { latest: meoSnapshot, previous: null });
  const panel = applied.panels.find((p) => p.key === "meo");
  assert.equal(panel?.status, "connected");
  assert.equal(panel?.metrics.find((m) => m.key === "r")?.value, "3.6 ★");
  assert.match(panel?.metrics.find((m) => m.key === "v")?.sub || "", /推定/);
  assert.equal(panel?.metrics.find((m) => m.key === "score")?.value, "32");
});

test("scrub 後も Notion オーバーレイで Instagram/MEO が未接続にならない", () => {
  const scrubbed = scrubUnconnectedSamples({ ...osSampleData, isSample: false });
  assert.equal(scrubbed.panels.find((p) => p.key === "instagram")?.metrics.find((m) => m.key === "fo")?.value, "未接続");

  let withMarketing = applyInstagramWeeklyOverlay(scrubbed, { latest: instagramSnapshot, previous: null });
  withMarketing = applyMeoWeeklyOverlay(withMarketing, { latest: meoSnapshot, previous: null });
  assert.equal(withMarketing.panels.find((p) => p.key === "instagram")?.metrics.find((m) => m.key === "views30")?.value, "10,000");
  assert.equal(withMarketing.panels.find((p) => p.key === "meo")?.metrics.find((m) => m.key === "nr")?.value, "13件");
});
