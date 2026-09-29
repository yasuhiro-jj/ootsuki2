import assert from "node:assert/strict";
import test from "node:test";
import { osSampleData } from "../mock/os-sample";
import { applyLineKpiOverlay } from "../lib/os/line-kpi";
import {
  applyLineScenarioOverlay,
  buildScenarioClickDropFindings,
  pickLatestScenarioSteps,
} from "../lib/os/line-scenario";

const kpiSnapshot = {
  fetchedAt: "2026-09-29T12:00:00.000Z",
  updatedAt: "2026-09-29T00:22:00.000Z",
  friends: 2847,
  previousFriends: 2800,
  dormant90: null,
  lastBroadcastDate: null,
  openRate: null,
  openCount: null,
  lineVisits7d: null,
  previousLineVisits7d: null,
  memo: "友だち数はプロライン管理画面ヘッダー表示",
  source: "プロライン",
};

test("LINE KPI を載せ、プロライン友だち数にツールチップを付ける", () => {
  const applied = applyLineKpiOverlay(osSampleData, kpiSnapshot);
  const panel = applied.panels.find((p) => p.key === "line");
  const friends = panel?.metrics.find((m) => m.key === "fr");
  assert.equal(friends?.value, "2,847人");
  assert.equal(friends?.origin, "actual");
  assert.match(friends?.hint || "", /プロライン/);
  assert.equal(panel?.metrics.find((m) => m.key === "last")?.value, "未取得");
  assert.equal(panel?.status, "grok_bot");
});

test("シナリオのクリック率低下を検知する", () => {
  const section = pickLatestScenarioSteps([
    {
      stepNumber: 1,
      stepName: "第一回目",
      sent: 100,
      clickRate: 74.3,
      blocks: 1,
      fetchedAt: "2026-09-29T12:00:00.000Z",
      scenarioName: "10ステップ",
      timing: "",
    },
    {
      stepNumber: 2,
      stepName: "第二回目",
      sent: 90,
      clickRate: 37.4,
      blocks: 2,
      fetchedAt: "2026-09-29T12:00:00.000Z",
      scenarioName: "10ステップ",
      timing: "",
    },
    {
      stepNumber: null,
      stepName: "次のシナリオに移動",
      sent: null,
      clickRate: null,
      blocks: null,
      fetchedAt: "2026-09-29T12:00:00.000Z",
      scenarioName: "10ステップ",
      timing: "",
    },
  ]);
  assert.equal(section?.steps.length, 2);
  const findings = buildScenarioClickDropFindings(section!, "2026-09-29T00:22:00.000Z");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.severity, 4);
  assert.match(findings[0]?.title || "", /74\.3%→37\.4%/);

  const applied = applyLineScenarioOverlay(osSampleData, section, "2026-09-29T00:22:00.000Z");
  assert.ok(applied.panels.find((p) => p.key === "line")?.lineScenario?.steps.length === 2);
});
