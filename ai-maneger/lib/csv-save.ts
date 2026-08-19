export type BatchSaveRowResult = {
  date: string;
  ok: boolean;
  deferred?: boolean;
  message?: string;
};

export const CSV_SAVE_INITIAL_CHUNK_SIZE = 3;
export const CSV_SAVE_MAX_ATTEMPTS = 6;
export const CSV_SAVE_TIME_BUDGET_MS = 8_000;

export function remainingRowsAfterBatch<T extends { date: string }>(
  requested: T[],
  results: BatchSaveRowResult[],
): T[] {
  const savedDates = new Set(results.filter((result) => result.ok).map((result) => result.date));
  return requested.filter((row) => !savedDates.has(row.date));
}

export function nextCsvSaveChunkSize(currentSize: number, hadTimeout: boolean): number {
  if (hadTimeout) return 1;
  return Math.max(1, currentSize);
}

export function canRetryCsvSave(attempts: number, maxAttempts = CSV_SAVE_MAX_ATTEMPTS): boolean {
  return attempts < maxAttempts;
}

export function uniqueWeekStarts(dates: string[], resolveWeekStart: (date: string) => string): string[] {
  const starts = new Set<string>();
  for (const date of dates) {
    if (!date) continue;
    starts.add(resolveWeekStart(date));
  }
  return [...starts];
}
