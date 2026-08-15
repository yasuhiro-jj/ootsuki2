import assert from "node:assert/strict";
import test from "node:test";
import {
  canRetryCsvSave,
  nextCsvSaveChunkSize,
  remainingRowsAfterBatch,
  uniqueWeekStarts,
} from "../lib/csv-save";
import { chunkArray } from "../lib/ootsuki";

test("chunkArray splits CSV save payloads into gateway-safe batches", () => {
  const rows = Array.from({ length: 12 }, (_, index) => index + 1);
  assert.deepEqual(chunkArray(rows, 5), [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]);
});

test("remainingRowsAfterBatch keeps unsaved and deferred dates for retry", () => {
  const requested = [{ date: "2026-08-01" }, { date: "2026-08-02" }, { date: "2026-08-03" }];
  const remaining = remainingRowsAfterBatch(requested, [
    { date: "2026-08-01", ok: true },
    { date: "2026-08-02", ok: false, deferred: true, message: "time_budget" },
  ]);
  assert.deepEqual(
    remaining.map((row) => row.date),
    ["2026-08-02", "2026-08-03"],
  );
});

test("nextCsvSaveChunkSize drops to 1 after a gateway timeout", () => {
  assert.equal(nextCsvSaveChunkSize(3, true), 1);
  assert.equal(nextCsvSaveChunkSize(3, false), 3);
});

test("canRetryCsvSave stops after the configured attempt limit", () => {
  assert.equal(canRetryCsvSave(0), true);
  assert.equal(canRetryCsvSave(5), true);
  assert.equal(canRetryCsvSave(6), false);
});

test("uniqueWeekStarts de-duplicates weekly summary refresh dates", () => {
  assert.deepEqual(
    uniqueWeekStarts(["2026-08-10", "2026-08-11", "2026-08-17"], (date) =>
      date <= "2026-08-16" ? "2026-08-10" : "2026-08-17",
    ),
    ["2026-08-10", "2026-08-17"],
  );
});
