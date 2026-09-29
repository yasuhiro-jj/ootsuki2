import type { Finding, LineScenarioSection, LineScenarioStepRow, OsDashboardData } from "@/types/os";

export type LineScenarioStepRecord = {
  stepNumber: number | null;
  stepName: string;
  sent: number | null;
  clickRate: number | null;
  blocks: number | null;
  fetchedAt: string;
  scenarioName: string;
  timing: string;
};

const EXCLUDE_TITLE = /次のシナリオに移動/;

export function isAggregatedScenarioStep(stepName: string, stepNumber: number | null) {
  if (stepNumber === null || !Number.isFinite(stepNumber)) return true;
  return EXCLUDE_TITLE.test(stepName);
}

/** 最新取得日のシナリオ名ごとにステップ1〜10を返す（集計除外行は除く）。 */
export function pickLatestScenarioSteps(rows: LineScenarioStepRecord[]): LineScenarioSection | null {
  if (rows.length === 0) return null;

  const latestDay = [...rows].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]?.fetchedAt.slice(0, 10);
  if (!latestDay) return null;

  const onLatest = rows.filter((row) => row.fetchedAt.slice(0, 10) === latestDay);
  const scenarioName =
    onLatest.map((row) => row.scenarioName).find((name) => name.trim().length > 0) || "（シナリオ名未設定）";

  const steps = onLatest
    .filter((row) => !row.scenarioName || row.scenarioName === scenarioName)
    .filter((row) => !isAggregatedScenarioStep(row.stepName, row.stepNumber))
    .filter((row): row is LineScenarioStepRecord & { stepNumber: number } => row.stepNumber !== null)
    .sort((left, right) => left.stepNumber - right.stepNumber)
    .slice(0, 10);

  if (steps.length === 0) return null;

  return {
    scenarioName,
    fetchedAt: latestDay,
    steps: steps.map(({ stepNumber, stepName, sent, clickRate, blocks }) => ({
      stepNumber,
      stepName,
      sent,
      clickRate,
      blocks,
    })),
  };
}

/** 直前ステップよりクリック率が10pt以上下がったステップを「高」重要度で返す。 */
export function buildScenarioClickDropFindings(section: LineScenarioSection, detectedAt: string): Finding[] {
  const findings: Finding[] = [];
  const ordered = [...section.steps].sort((a, b) => a.stepNumber - b.stepNumber);

  for (let index = 1; index < ordered.length; index += 1) {
    const prev = ordered[index - 1];
    const current = ordered[index];
    if (prev.clickRate === null || current.clickRate === null) continue;
    const drop = prev.clickRate - current.clickRate;
    if (drop < 10) continue;

    findings.push({
      id: `line-scenario-drop-${current.stepNumber}`,
      agentKey: "customer",
      detectorKey: "line_scenario_click_drop",
      kind: "problem",
      title: `${current.stepName} クリック率 ${prev.clickRate.toFixed(1)}%→${current.clickRate.toFixed(1)}%`,
      severity: 4,
      evidence: [
        {
          metric: "クリック率",
          current: `${current.clickRate.toFixed(1)}%`,
          previous: `${prev.clickRate.toFixed(1)}%`,
          origin: "actual",
          source: section.scenarioName,
        },
      ],
      detectedAt,
      status: "open",
      origin: "actual",
      source: "notion:line-scenario",
    });
  }

  return findings;
}

export function applyLineScenarioOverlay(
  data: OsDashboardData,
  section: LineScenarioSection | null,
  detectedAt: string,
): OsDashboardData {
  if (!section) return data;

  const scenarioFindings = buildScenarioClickDropFindings(section, detectedAt);
  return {
    ...data,
    panels: data.panels.map((panel) => {
      if (panel.key !== "line") return panel;
      const rest = panel.findings.filter((f) => !f.id.startsWith("line-scenario-drop-"));
      return {
        ...panel,
        lineScenario: section,
        findings: [...scenarioFindings, ...rest],
      };
    }),
    agents: data.agents.map((agent) =>
      agent.key === "customer"
        ? {
            ...agent,
            state: "ok",
            lastRunAt: detectedAt,
            findingsCount: Math.max(scenarioFindings.length, agent.findingsCount),
          }
        : agent,
    ),
  };
}
