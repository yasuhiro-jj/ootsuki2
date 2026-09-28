import assert from "node:assert/strict";
import test from "node:test";
import { applyStoredDecisions, type StoredOsDecision } from "../lib/os/decisions";
import { osSampleData } from "../mock/os-sample";

function row(overrides: Partial<StoredOsDecision> & Pick<StoredOsDecision, "id" | "taskId" | "decision" | "decidedAt">): StoredOsDecision {
  return {
    taskTitle: "仕事",
    agentKey: "finance",
    fromState: "PROPOSED",
    toState: overrides.decision === "reject" ? "REJECTED" : overrides.decision === "hold" ? "ON_HOLD" : "APPROVED",
    decidedBy: "owner",
    ...overrides,
  };
}

test("保存が無いときはデータを変えない", () => {
  const result = applyStoredDecisions(osSampleData, []);
  assert.equal(result, osSampleData);
});

test("保存した判断で状態・履歴・承認率を更新する", () => {
  const result = applyStoredDecisions(osSampleData, [
    row({
      id: "saved-1",
      taskId: "t1",
      taskTitle: "損益の仕事",
      decision: "reject",
      reasonText: "今月は見送る",
      decidedAt: "2026-09-28T08:00:00.000Z",
    }),
  ]);
  const task = result.tasks.find((item) => item.id === "t1");
  assert.equal(task?.state, "REJECTED");
  assert.equal(task?.lastDecision?.reasonText, "今月は見送る");
  assert.equal(result.decisions[0]?.id, "saved-1");
  assert.equal(result.timeline[0]?.toState, "REJECTED");
  const finance = result.acceptance.find((item) => item.agentKey === "finance");
  assert.equal(finance?.rejected, 1);
  assert.equal(osSampleData.tasks.find((item) => item.id === "t1")?.state, "PROPOSED");
});

test("同じ仕事への後の判断が状態になる", () => {
  const result = applyStoredDecisions(osSampleData, [
    row({ id: "a", taskId: "t1", decision: "approve", decidedAt: "2026-09-28T08:00:00.000Z" }),
    row({ id: "b", taskId: "t1", decision: "hold", holdUntil: "2026-10-01", reasonText: "来月", decidedAt: "2026-09-28T09:00:00.000Z" }),
  ]);
  const task = result.tasks.find((item) => item.id === "t1");
  assert.equal(task?.state, "ON_HOLD");
  assert.equal(task?.holdUntil, "2026-10-01");
  assert.equal(result.decisions[0]?.id, "b");
  assert.equal(result.acceptance.find((item) => item.agentKey === "finance")?.approved, 4);
  assert.equal(result.acceptance.find((item) => item.agentKey === "finance")?.held, 1);
});
