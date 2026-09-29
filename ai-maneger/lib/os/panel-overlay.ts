import type { OsDashboardData } from "@/types/os";

export function pctChange(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function replacePanelMetric(
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

export function clonePanelsForOverlay(data: OsDashboardData): OsDashboardData {
  return {
    ...data,
    panels: data.panels.map((panel) => ({
      ...panel,
      metrics: panel.metrics.map((metric) => ({ ...metric })),
      findings: panel.findings.filter((item) => item.origin !== "sample"),
    })),
    connectors: data.connectors.map((connector) => ({ ...connector })),
  };
}
