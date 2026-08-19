export type UsenTimeZoneRowType = "daily" | "monthly-total" | "weekday-average" | "weekday-total" | "other";

export type UsenTimeZoneSalesRow = {
  storeCode: string;
  storeName: string;
  businessDateLabel: string;
  businessDate?: string;
  rowType: UsenTimeZoneRowType;
  target: string;
  hourlySales: Record<string, number>;
  total: number;
};

export type UsenTimeZoneSalesSummary = {
  target: string;
  total: number;
  dailyTotal: number;
  dailyCount: number;
  hours: string[];
  hourlyTotals: Array<{ hour: string; value: number }>;
  peakHours: Array<{ hour: string; value: number }>;
  rows: UsenTimeZoneSalesRow[];
};

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function normalizeHeader(value: string) {
  return stripBom(value).trim().replace(/^"+|"+$/g, "").replace(/\s+/g, "");
}

function splitRows(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

function detectDelimiter(line: string) {
  const tabCount = (line.match(/\t/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim().replace(/^"+|"+$/g, ""));
}

export function parseCsv(text: string): string[][] {
  const lines = splitRows(text);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0]);
  return lines.map((line) => parseDelimitedLine(line, delimiter));
}

export function parseNumberText(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.normalize("NFKC").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDateLabel(value: string): string | undefined {
  const match = value.normalize("NFKC").match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function classifyRow(value: string): UsenTimeZoneRowType {
  if (/【\s*合計\s*】/.test(value)) return "monthly-total";
  if (/平均/.test(value)) return "weekday-average";
  if (/合計/.test(value)) return "weekday-total";
  if (normalizeDateLabel(value)) return "daily";
  return "other";
}

function findColumn(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

export function parseUsenTimeZoneSalesCsv(text: string): UsenTimeZoneSalesRow[] {
  const records = parseCsv(text);
  if (records.length < 2) return [];

  const headers = records[0].map(normalizeHeader);
  const storeCodeIndex = findColumn(headers, ["店舗コード"]);
  const storeNameIndex = findColumn(headers, ["店舗"]);
  const dateIndex = findColumn(headers, ["営業日", "日付"]);
  const targetIndex = findColumn(headers, ["集計対象"]);
  const totalIndex = findColumn(headers, ["合計"]);
  const hourColumns = headers
    .map((header, index) => {
      const match = header.match(/^(\d{1,2})時$/);
      return match ? { index, hour: `${match[1].padStart(2, "0")}:00` } : null;
    })
    .filter((entry): entry is { index: number; hour: string } => Boolean(entry));

  if (dateIndex < 0 || hourColumns.length === 0) return [];

  return records.slice(1).map((record) => {
    const businessDateLabel = record[dateIndex] || "";
    const hourlySales = Object.fromEntries(
      hourColumns.map(({ index, hour }) => [hour, parseNumberText(record[index])]),
    );
    const sumHourly = Object.values(hourlySales).reduce((sum, value) => sum + value, 0);
    return {
      storeCode: storeCodeIndex >= 0 ? record[storeCodeIndex] || "" : "",
      storeName: storeNameIndex >= 0 ? record[storeNameIndex] || "" : "",
      businessDateLabel,
      businessDate: normalizeDateLabel(businessDateLabel),
      rowType: classifyRow(businessDateLabel),
      target: targetIndex >= 0 ? record[targetIndex] || "" : "",
      hourlySales,
      total: totalIndex >= 0 ? parseNumberText(record[totalIndex]) : sumHourly,
    };
  });
}

export function summarizeUsenTimeZoneSales(rows: UsenTimeZoneSalesRow[]): UsenTimeZoneSalesSummary {
  const dailyRows = rows.filter((row) => row.rowType === "daily");
  const monthlyTotal = rows.find((row) => row.rowType === "monthly-total");
  const basisRows = monthlyTotal ? [monthlyTotal] : dailyRows;
  const hours = Array.from(new Set(rows.flatMap((row) => Object.keys(row.hourlySales)))).sort();
  const hourlyTotals = hours.map((hour) => ({
    hour,
    value: basisRows.reduce((sum, row) => sum + (row.hourlySales[hour] || 0), 0),
  }));
  const dailyTotal = dailyRows.reduce((sum, row) => sum + row.total, 0);
  const total = monthlyTotal?.total ?? dailyTotal;

  return {
    target: rows.find((row) => row.target)?.target || "注文金額",
    total,
    dailyTotal,
    dailyCount: dailyRows.length,
    hours,
    hourlyTotals,
    peakHours: [...hourlyTotals].sort((left, right) => right.value - left.value).slice(0, 3),
    rows,
  };
}
