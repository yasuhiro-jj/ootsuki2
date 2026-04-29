"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { normalizeProductCodeKey, normalizeProductMatchKey } from "@/lib/ootsuki";

interface DailyInputFormProps {
  defaultDate: string;
}

interface CsvImportedRow {
  id: string;
  date: string;
  label: string;
  sales: string;
  customers: string;
  averageSpend: string;
  grossMarginRate: string;
  grossProfit: string;
  lineRegistrations: string;
  lineVisits: string;
  returnsAmount: string;
  discountAmount: string;
  paymentMemo: string;
  memo: string;
  salesYoY: string;
  customersYoY: string;
  averageSpendYoY: string;
  budget: string;
  achievementRate: string;
  previousDate: string;
  previousSales: string;
  previousCustomers: string;
  previousAverageSpend: string;
}

interface ProductAnalysisRow {
  id: string;
  label: string;
  productCode: string;
  productName: string;
  category1: string;
  category2: string;
  averageUnitPrice: number;
  quantity: number;
  sales: number;
  compositionRatio: number;
  rank: string;
  estimatedCost: number;
  grossProfit: number;
  grossMarginRate: number;
  period: string;
  source: string;
  isExcluded: boolean;
}

interface ProductAnalysisSummary {
  totalSales: number;
  totalEstimatedCost: number;
  totalGrossProfit: number;
  overallGrossMarginRate: number;
  topProducts: ProductAnalysisRow[];
  lowMarginProducts: ProductAnalysisRow[];
  topCategories: Array<{ name: string; sales: number }>;
}

interface ProductAnalysisGuard {
  level: "safe" | "warning" | "danger";
  title: string;
  message: string;
}

interface CsvAggregate {
  dates: string[];
  previousDates: string[];
  sales: string;
  customers: string;
  averageSpend: string;
  salesYoY: string;
  customersYoY: string;
  averageSpendYoY: string;
  budget: string;
  achievementRate: string;
  previousSales: string;
  previousCustomers: string;
  previousAverageSpend: string;
}

function yearTokyo(): number {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    calendar: "gregory",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const n = y ? Number(y) : NaN;
  return Number.isFinite(n) ? n : new Date().getFullYear();
}

function normalizeDate(value: string) {
  let trimmed = value.trim();
  if (!trimmed) return "";

  trimmed = trimmed.replace(/\s*[\(\uff08][^\)\uff09]*[\)\uff09]\s*/g, "").trim();

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length === 8) {
    const y = digitsOnly.slice(0, 4);
    const m = digitsOnly.slice(4, 6);
    const d = digitsOnly.slice(6, 8);
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  let replaced = trimmed.replace(/[./年月]/g, "-").replace(/日/g, "");
  let parts = replaced
    .split("-")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    const month = Number(parts[0]);
    const day = Number(parts[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const yyyy = yearTokyo();
      const normalized = `${yyyy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return normalized;
    }
    return "";
  }

  if (parts.length !== 3) return "";

  const [year, month, day] = parts;
  const normalized = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseNumberText(value: string) {
  const normalized = value
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/[¥￥]/g, "")
    .trim();
  if (!normalized) return "";
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

/** CSV列名の揺れ（レジ出力の「当年○○」と統一スキーマの「売上」等）を吸収 */
function csvFirstNonEmpty(record: Record<string, string>, keys: readonly string[]): string {
  for (const key of keys) {
    const v = record[key];
    if (v !== undefined && String(v).trim() !== "") return v;
  }
  return "";
}

function csvFirstNormalizedDate(record: Record<string, string>, keys: readonly string[]): string {
  for (const key of keys) {
    const d = normalizeDate(record[key] ?? "");
    if (d) return d;
  }
  return "";
}

function stripBomUnicode(s: string): string {
  if (s.length > 0 && s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

function normalizeCsvRawText(raw: string): string {
  return stripBomUnicode(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function detectCsvDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  const max = Math.max(tabs, commas, semis);
  if (max === 0) return ",";
  if (tabs === max) return "\t";
  if (semis === max) return ";";
  return ",";
}

function parseCsv(text: string) {
  const normalized = normalizeCsvRawText(text);
  const firstNl = normalized.indexOf("\n");
  const headerLine = firstNl === -1 ? normalized : normalized.slice(0, firstNl);
  const delimiter = detectCsvDelimiter(headerLine);

  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim() !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

function mapCsvRows(text: string): CsvImportedRow[] {
  const table = parseCsv(text);
  const headers = table[0]?.map((header) => stripBomUnicode(header.trim())) ?? [];
  const body = table.slice(1);

  return body
    .map((row, index) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
      const date = csvFirstNormalizedDate(record, ["当年日付", "日付", "日付メモ"]);
      if (!date) return null;

      const salesText = csvFirstNonEmpty(record, ["当年実績", "売上", "売上(税抜)"]);
      const customersText = csvFirstNonEmpty(record, ["当年客数", "客数"]);

      return {
        id: `${date}-${index}`,
        date,
        label: `${date} / 売上 ${salesText || "0"} / 客数 ${customersText || "0"}`,
        sales: parseNumberText(salesText),
        customers: parseNumberText(customersText),
        averageSpend: parseNumberText(csvFirstNonEmpty(record, ["当年客単", "客単価", "客単価(自動)"])),
        grossMarginRate: parseNumberText(csvFirstNonEmpty(record, ["粗利率(%)", "粗利率"])),
        grossProfit: parseNumberText(csvFirstNonEmpty(record, ["粗利", "粗利額"])),
        lineRegistrations: parseNumberText(csvFirstNonEmpty(record, ["LINE登録数", "LINE友だち追加数"])),
        lineVisits: parseNumberText(csvFirstNonEmpty(record, ["LINE経由来店数", "LINE来店数"])),
        returnsAmount: parseNumberText(csvFirstNonEmpty(record, ["取消返品", "取消/返品金額", "返品金額"])),
        discountAmount: parseNumberText(csvFirstNonEmpty(record, ["値引き", "値引き金額"])),
        paymentMemo: csvFirstNonEmpty(record, ["決済内訳メモ", "決済メモ", "決済内訳（メモ）"]),
        memo: csvFirstNonEmpty(record, ["メモ", "所感/メモ", "備考"]),
        salesYoY: parseNumberText(
          csvFirstNonEmpty(record, ["差前年差異", "売上昨対比", "売上前年比(%)"]),
        ),
        customersYoY: parseNumberText(
          csvFirstNonEmpty(record, ["差前年差客", "客数昨対比", "客数前年比(%)"]),
        ),
        averageSpendYoY: parseNumberText(
          csvFirstNonEmpty(record, ["前差客単", "客単価昨対比", "客単価前年比(%)"]),
        ),
        budget: parseNumberText(record["当年予算"] ?? ""),
        achievementRate: parseNumberText(record["当年達成率"] ?? ""),
        previousDate: normalizeDate(record["前年日付"] ?? ""),
        previousSales: parseNumberText(record["前年実績"] ?? ""),
        previousCustomers: parseNumberText(record["前年客数"] ?? ""),
        previousAverageSpend: parseNumberText(record["前年客単"] ?? ""),
      };
    })
    .filter((row): row is CsvImportedRow => Boolean(row));
}

/** レジ・Notion出力のエンコード揺れ（UTF-8 / Shift_JIS / Excel UTF-16 等）に対応して最も行が取れた文字列を採用 */
function decodeDailyCsvBest(buffer: ArrayBuffer): string {
  const u = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 4)));
  const candidates: string[] = [];

  if (buffer.byteLength >= 2) {
    const b0 = u[0];
    const b1 = u[1] ?? 0;
    if (b0 === 0xff && b1 === 0xfe) {
      candidates.push(new TextDecoder("utf-16le", { fatal: false }).decode(buffer));
    }
    if (b0 === 0xfe && b1 === 0xff) {
      candidates.push(new TextDecoder("utf-16be", { fatal: false }).decode(buffer));
    }
  }

  const encodings = ["utf-8", "shift-jis", "sjis", "windows-31j"] as const;
  for (const enc of encodings) {
    try {
      candidates.push(new TextDecoder(enc, { fatal: false }).decode(buffer));
    } catch {
      /* skip unsupported label */
    }
  }

  if (candidates.length === 0) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    } catch {
      return "";
    }
  }

  let bestText = candidates[0]!;
  let bestScore = mapCsvRows(bestText).length;

  for (let i = 1; i < candidates.length; i += 1) {
    const t = candidates[i]!;
    const score = mapCsvRows(t).length;
    if (score > bestScore) {
      bestScore = score;
      bestText = t;
    }
  }

  return bestText;
}

function parseProductAnalysisRows(text: string): ProductAnalysisRow[] {
  const table = parseCsv(text);
  const headers = table[0]?.map((header) => stripBomUnicode(header.trim())) ?? [];
  const body = table.slice(1);

  return body
    .map((row, index) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
      const productName = csvFirstNonEmpty(record, ["商品名", "品名", "メニュー名"]).trim();
      const sales = Number(parseNumberText(csvFirstNonEmpty(record, ["売上金額", "売上", "売上(税抜)"])));

      if (!productName || !Number.isFinite(sales)) {
        return null;
      }

      const grossProfit = Number(parseNumberText(csvFirstNonEmpty(record, ["粗利", "粗利額"]))) || 0;
      const estimatedCostFromCsv = Number(parseNumberText(csvFirstNonEmpty(record, ["想定原価", "原価"]))) || 0;
      const estimatedCost = estimatedCostFromCsv || (grossProfit > 0 ? Math.max(sales - grossProfit, 0) : 0);
      const grossMarginRate =
        Number(parseNumberText(csvFirstNonEmpty(record, ["粗利率", "粗利率(%)"]))) ||
        (sales > 0 && grossProfit > 0 ? (grossProfit / sales) * 100 : 0);

      return {
        id: `${productName}-${index}`,
        label: `${productName} / 売上 ${sales.toLocaleString()}円`,
        productCode: normalizeProductCodeKey(csvFirstNonEmpty(record, ["商品コード", "コード"])),
        productName,
        category1: csvFirstNonEmpty(record, ["カテゴリ1", "カテゴリー1", "大分類"]).trim(),
        category2: csvFirstNonEmpty(record, ["カテゴリ2", "カテゴリー2", "中分類"]).trim(),
        averageUnitPrice: Number(parseNumberText(csvFirstNonEmpty(record, ["平均単価", "単価"]))) || 0,
        quantity: Number(parseNumberText(csvFirstNonEmpty(record, ["売上数量", "数量"]))) || 0,
        sales,
        compositionRatio: Number(parseNumberText(csvFirstNonEmpty(record, ["構成比", "構成比(%)"]))) || 0,
        rank: csvFirstNonEmpty(record, ["ランク", "順位"]).trim(),
        estimatedCost,
        grossProfit,
        grossMarginRate,
        period: csvFirstNonEmpty(record, ["対象期間", "期間"]).trim(),
        source: csvFirstNonEmpty(record, ["ソース", "ソース（CSV名等）"]).trim(),
        isExcluded: false,
      };
    })
    .filter((row): row is ProductAnalysisRow => Boolean(row));
}

/** 商品分析CSVもUTF-8/Shift_JIS/Excel UTF-16を自動判定する */
function decodeProductAnalysisCsvBest(buffer: ArrayBuffer): string {
  const u = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 4)));
  const candidates: string[] = [];

  if (buffer.byteLength >= 2) {
    const b0 = u[0];
    const b1 = u[1] ?? 0;
    if (b0 === 0xff && b1 === 0xfe) {
      candidates.push(new TextDecoder("utf-16le", { fatal: false }).decode(buffer));
    }
    if (b0 === 0xfe && b1 === 0xff) {
      candidates.push(new TextDecoder("utf-16be", { fatal: false }).decode(buffer));
    }
  }

  const encodings = ["utf-8", "shift-jis", "sjis", "windows-31j"] as const;
  for (const enc of encodings) {
    try {
      candidates.push(new TextDecoder(enc, { fatal: false }).decode(buffer));
    } catch {
      /* skip unsupported label */
    }
  }

  if (candidates.length === 0) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    } catch {
      return "";
    }
  }

  let bestText = candidates[0]!;
  let bestScore = parseProductAnalysisRows(bestText).length;

  for (let i = 1; i < candidates.length; i += 1) {
    const t = candidates[i]!;
    const score = parseProductAnalysisRows(t).length;
    if (score > bestScore) {
      bestScore = score;
      bestText = t;
    }
  }

  return bestText;
}

function buildProductAnalysisSummary(rows: ProductAnalysisRow[]): ProductAnalysisSummary | null {
  const activeRows = rows.filter((row) => !row.isExcluded);
  if (activeRows.length === 0) {
    return null;
  }

  const totalSales = activeRows.reduce((sum, row) => sum + row.sales, 0);
  const totalEstimatedCost = activeRows.reduce((sum, row) => sum + row.estimatedCost, 0);
  const totalGrossProfit = activeRows.reduce((sum, row) => sum + row.grossProfit, 0);
  const categorySalesMap = new Map<string, number>();

  activeRows.forEach((row) => {
    const key = row.category1 || row.category2 || "未分類";
    categorySalesMap.set(key, (categorySalesMap.get(key) ?? 0) + row.sales);
  });

  return {
    totalSales,
    totalEstimatedCost,
    totalGrossProfit,
    overallGrossMarginRate: totalSales > 0 ? (totalGrossProfit / totalSales) * 100 : 0,
    topProducts: [...activeRows].sort((left, right) => right.sales - left.sales).slice(0, 5),
    lowMarginProducts: [...activeRows]
      .filter((row) => row.sales > 0)
      .sort((left, right) => left.grossMarginRate - right.grossMarginRate)
      .slice(0, 5),
    topCategories: [...categorySalesMap.entries()]
      .map(([name, sales]) => ({ name, sales }))
      .sort((left, right) => right.sales - left.sales)
      .slice(0, 5),
  };
}

function buildProductAnalysisGuard(summary: ProductAnalysisSummary | null, dailySales: number): ProductAnalysisGuard | null {
  if (!summary) {
    return null;
  }

  if (dailySales <= 0) {
    return {
      level: "danger",
      title: "日次売上が未設定です",
      message:
        "商品分析CSVだけを先に反映すると、月間や期間違いの粗利額が1日分として保存される恐れがあります。先にレジCSV取込か日次売上入力を済ませてください。",
    };
  }

  const diff = Math.abs(summary.totalSales - dailySales);
  const diffRate = dailySales > 0 ? diff / dailySales : 0;

  if (diffRate >= 0.5) {
    return {
      level: "danger",
      title: "商品分析CSVの売上期間が一致していない可能性があります",
      message: `商品分析CSVの売上合計 ${summary.totalSales.toLocaleString()}円 と日次売上 ${dailySales.toLocaleString()}円 の差が大きすぎます。月間CSVや別日付のCSVでないか確認してください。`,
    };
  }

  if (diffRate >= 0.1) {
    return {
      level: "warning",
      title: "商品分析CSVの売上と日次売上に差があります",
      message: `商品分析CSV ${summary.totalSales.toLocaleString()}円 / 日次売上 ${dailySales.toLocaleString()}円 です。対象日の売上かどうか確認してから反映してください。`,
    };
  }

  return {
    level: "safe",
    title: "商品分析CSVの売上期間は概ね一致しています",
    message: `商品分析CSV ${summary.totalSales.toLocaleString()}円 / 日次売上 ${dailySales.toLocaleString()}円 です。`,
  };
}

function mergeEstimatedCostsFromNotion(
  rows: ProductAnalysisRow[],
  notionData: {
    byCode?: Record<string, { estimatedCost: number; excluded: boolean }>;
    byName?: Record<string, { estimatedCost: number; excluded: boolean }>;
  },
) {
  let supplementedCount = 0;
  let excludedCount = 0;

  const mergedRows = rows.map((row) => {
    const normalizedCode = normalizeProductCodeKey(row.productCode);
    const normalizedName = normalizeProductMatchKey(row.productName);
    const matched =
      (normalizedCode && notionData.byCode?.[normalizedCode]) ||
      (normalizedName && notionData.byName?.[normalizedName]);

    if (!matched) {
      return row;
    }

    if (matched.excluded) {
      excludedCount += 1;
    }

    if (row.estimatedCost <= 0 && matched.estimatedCost > 0) {
      supplementedCount += 1;
    }

    const estimatedCost = matched.estimatedCost > 0 ? matched.estimatedCost : row.estimatedCost;
    const grossProfit = Math.max(row.sales - estimatedCost, 0);
    const grossMarginRate = row.sales > 0 ? (grossProfit / row.sales) * 100 : 0;

    return {
      ...row,
      label: `${row.productName}${matched.excluded ? " [計算対象外]" : ""} / 売上 ${row.sales.toLocaleString()}円`,
      estimatedCost,
      grossProfit,
      grossMarginRate,
      isExcluded: matched.excluded,
    };
  });

  return { mergedRows, supplementedCount, excludedCount };
}

function sumCsvField(rows: CsvImportedRow[], key: keyof Pick<CsvImportedRow, "sales" | "customers" | "budget" | "previousSales" | "previousCustomers">) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function averageCsvField(
  rows: CsvImportedRow[],
  key: keyof Pick<CsvImportedRow, "salesYoY" | "customersYoY" | "averageSpendYoY" | "achievementRate" | "previousAverageSpend">,
) {
  if (rows.length === 0) return "";
  const total = rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  return String(total / rows.length);
}

function buildCsvAggregate(rows: CsvImportedRow[]): CsvAggregate | null {
  if (rows.length === 0) return null;

  const totalSales = sumCsvField(rows, "sales");
  const totalCustomers = sumCsvField(rows, "customers");
  const totalBudget = sumCsvField(rows, "budget");
  const totalPreviousSales = sumCsvField(rows, "previousSales");
  const totalPreviousCustomers = sumCsvField(rows, "previousCustomers");
  const averageSpend = totalCustomers > 0 ? String(totalSales / totalCustomers) : "";

  return {
    dates: rows.map((row) => row.date),
    previousDates: rows.map((row) => row.previousDate).filter(Boolean),
    sales: String(totalSales),
    customers: String(totalCustomers),
    averageSpend,
    salesYoY: averageCsvField(rows, "salesYoY"),
    customersYoY: averageCsvField(rows, "customersYoY"),
    averageSpendYoY: averageCsvField(rows, "averageSpendYoY"),
    budget: String(totalBudget),
    achievementRate: averageCsvField(rows, "achievementRate"),
    previousSales: String(totalPreviousSales),
    previousCustomers: String(totalPreviousCustomers),
    previousAverageSpend: averageCsvField(rows, "previousAverageSpend"),
  };
}

export function DailyInputForm({ defaultDate }: DailyInputFormProps) {
  const [date, setDate] = useState(defaultDate);
  const [sales, setSales] = useState("");
  const [customers, setCustomers] = useState("");
  const [averageSpend, setAverageSpend] = useState("");
  const [grossMarginRate, setGrossMarginRate] = useState("");
  const [lineRegistrations] = useState("0");
  const [lineVisits] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [returnsAmount, setReturnsAmount] = useState("0");
  const [paymentMemo, setPaymentMemo] = useState("");
  const [source, setSource] = useState("Web日次入力");
  const [memo, setMemo] = useState("");
  const [csvRows, setCsvRows] = useState<CsvImportedRow[]>([]);
  const [selectedCsvRowIds, setSelectedCsvRowIds] = useState<string[]>([]);
  const [appliedCsvRowIds, setAppliedCsvRowIds] = useState<string[]>([]);
  const [csvStatus, setCsvStatus] = useState<string>("");
  const [productRows, setProductRows] = useState<ProductAnalysisRow[]>([]);
  const [selectedProductRowIds, setSelectedProductRowIds] = useState<string[]>([]);
  const [productCsvStatus, setProductCsvStatus] = useState<string>("");
  const [submitStatus, setSubmitStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchStatus, setBatchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [batchMessage, setBatchMessage] = useState("");
  const [batchElapsedSec, setBatchElapsedSec] = useState(0);
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current);
    };
  }, []);
  const [meoDone, setMeoDone] = useState(false);
  const [lineDone, setLineDone] = useState(false);
  const [storePopDone, setStorePopDone] = useState(false);

  const selectedCsvRows = useMemo(
    () => csvRows.filter((row) => selectedCsvRowIds.includes(row.id)),
    [csvRows, selectedCsvRowIds],
  );
  const selectedCsvAggregate = useMemo(() => buildCsvAggregate(selectedCsvRows), [selectedCsvRows]);
  const appliedCsvRows = useMemo(
    () => csvRows.filter((row) => appliedCsvRowIds.includes(row.id)),
    [csvRows, appliedCsvRowIds],
  );
  const appliedCsvAggregate = useMemo(() => buildCsvAggregate(appliedCsvRows), [appliedCsvRows]);
  const selectedProductRows = useMemo(
    () => productRows.filter((row) => selectedProductRowIds.includes(row.id)),
    [productRows, selectedProductRowIds],
  );
  const productSummary = useMemo(() => buildProductAnalysisSummary(selectedProductRows), [selectedProductRows]);
  const productAnalysisGuard = useMemo(
    () => buildProductAnalysisGuard(productSummary, Number(sales) || 0),
    [productSummary, sales],
  );
  const canApplyProductSummary = productAnalysisGuard?.level !== "danger";

  async function handleCsvUpload(file: File) {
    const buffer = await file.arrayBuffer();
    const text = decodeDailyCsvBest(buffer);
    const parsedRows = mapCsvRows(text);

    if (parsedRows.length === 0) {
      setCsvRows([]);
      setSelectedCsvRowIds([]);
      setAppliedCsvRowIds([]);
      setCsvStatus(
        "CSVから対象行を読み取れませんでした。日付列（当年日付・日付・日付メモ）と売上・客数列があるか、Excelの「CSV UTF-16」なら保存し直すかメモ帳でUTF-8にして再試行してください。",
      );
      return;
    }

    const latestRow = parsedRows[parsedRows.length - 1];
    setCsvRows(parsedRows);
    setSelectedCsvRowIds([latestRow.id]);
    setAppliedCsvRowIds([latestRow.id]);
    setCsvStatus(`${parsedRows.length} 行を読み込みました。既定では最新行を反映しています。`);
    setDate(latestRow.date || defaultDate);
    setSales(latestRow.sales);
    setCustomers(latestRow.customers);
    setAverageSpend(latestRow.averageSpend);
    setSource(`CSV取込: ${file.name}`);
  }

  function applyCsvRows(rows: CsvImportedRow[]) {
    const aggregate = buildCsvAggregate(rows);
    if (!aggregate) return;

    setAppliedCsvRowIds(rows.map((row) => row.id));
    setDate(rows[rows.length - 1]?.date || defaultDate);
    setSales(aggregate.sales);
    setCustomers(aggregate.customers);
    setAverageSpend(aggregate.averageSpend);
  }

  async function handleProductCsvUpload(file: File) {
    const buffer = await file.arrayBuffer();
    const text = decodeProductAnalysisCsvBest(buffer);
    const parsedRows = parseProductAnalysisRows(text);

    if (parsedRows.length === 0) {
      setProductRows([]);
      setSelectedProductRowIds([]);
      setProductCsvStatus(
        "商品分析CSVから対象行を読み取れませんでした。商品名・売上金額・粗利・粗利率(%) などの列名と、文字コード（UTF-8 / Shift_JIS / Excel UTF-16）を確認してください。",
      );
      return;
    }

    let resolvedRows = parsedRows;
    let supplementedCount = 0;
    let lookupWarning = "";

    try {
      const res = await fetch("/api/product-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: parsedRows.map((row) => ({
            productCode: row.productCode,
            productName: row.productName,
          })),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        byCode?: Record<string, { estimatedCost: number; excluded: boolean }>;
        byName?: Record<string, { estimatedCost: number; excluded: boolean }>;
      };

      if (!res.ok || !data.ok) {
        lookupWarning = data.message || `想定原価の補完に失敗しました（HTTP ${res.status}）。`;
      } else {
        const merged = mergeEstimatedCostsFromNotion(parsedRows, data);
        resolvedRows = merged.mergedRows;
        supplementedCount = merged.supplementedCount;
        if (merged.excludedCount > 0) {
          lookupWarning = `計算対象外の ${merged.excludedCount} 件を粗利計算から除外しました。`;
        }
      }
    } catch (error) {
      lookupWarning =
        error instanceof Error ? `想定原価の補完に失敗しました: ${error.message}` : "想定原価の補完に失敗しました。";
    }

    setProductRows(resolvedRows);
    setSelectedProductRowIds(resolvedRows.map((row) => row.id));
    setProductCsvStatus(
      [
        `${resolvedRows.length} 商品を読み込みました。既定では全商品を集計しています。`,
        supplementedCount > 0 ? `想定原価を Notion から ${supplementedCount} 件補完しました。` : "",
        lookupWarning,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  function stopBatchTimer() {
    if (batchTimerRef.current) {
      clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
    }
  }

  function applyProductSummaryToForm(forced: boolean) {
    if (!productSummary) return;
    setGrossMarginRate(productSummary.overallGrossMarginRate.toFixed(1));
    const topInfo = productSummary.topProducts
      .map((p) => `${p.productName}(${p.sales.toLocaleString()}円)`)
      .join(" / ");
    const lowInfo = productSummary.lowMarginProducts
      .map((p) => `${p.productName}(${p.grossMarginRate.toFixed(1)}%)`)
      .join(" / ");
    const memoLines = [
      `粗利率: ${productSummary.overallGrossMarginRate.toFixed(1)}%`,
      `粗利額: ${productSummary.totalGrossProfit.toLocaleString()}円`,
      `売上TOP: ${topInfo}`,
      `低粗利: ${lowInfo}`,
    ].join("\n");
    setMemo((prev) => (prev ? `${prev}\n---\n${memoLines}` : memoLines));
    setProductCsvStatus(
      `${forced ? "警告を承知のうえで反映しました。" : ""}粗利率 ${productSummary.overallGrossMarginRate.toFixed(1)}% をフォームに反映し、商品分析をメモに追記しました。`.trim(),
    );
  }

  async function handleBatchSave() {
    if (selectedCsvRows.length === 0) {
      setBatchMessage("保存する行を選択してください。");
      setBatchStatus("error");
      return;
    }

    const total = selectedCsvRows.length;
    const estimatedSec = Math.max(10, Math.round(total * 2.5));

    setBatchStatus("loading");
    setBatchElapsedSec(0);
    setBatchMessage(
      `${total}件をNotionに保存しています…（1件ずつ書き込むため、目安 約${estimatedSec}秒。そのままお待ちください）`,
    );

    stopBatchTimer();
    const startedAt = Date.now();
    batchTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setBatchElapsedSec(elapsed);
      if (elapsed >= 60) {
        setBatchMessage(
          `${total}件を保存中…（${elapsed}秒経過 / 通常より時間がかかっています。Notion側の応答待ちです。画面はそのままお待ちください）`,
        );
      } else if (elapsed >= 20) {
        setBatchMessage(
          `${total}件を保存中…（${elapsed}秒経過 / 完了までもう少しかかります。画面を閉じずにお待ちください）`,
        );
      } else {
        setBatchMessage(
          `${total}件をNotionに保存しています…（${elapsed}秒経過 / 目安 約${estimatedSec}秒）`,
        );
      }
    }, 1000);

    const rows = selectedCsvRows.map((row) => ({
      date: row.date,
      sales: Number(row.sales) || 0,
      customers: Number(row.customers) || 0,
      averageSpend: Number(row.averageSpend) || undefined,
      grossMarginRate: row.grossMarginRate ? Number(row.grossMarginRate) : undefined,
      grossProfit: row.grossProfit ? Number(row.grossProfit) : undefined,
      lineRegistrations: row.lineRegistrations ? Number(row.lineRegistrations) : undefined,
      lineVisits: row.lineVisits ? Number(row.lineVisits) : undefined,
      returnsAmount: row.returnsAmount ? Number(row.returnsAmount) : undefined,
      discountAmount: row.discountAmount ? Number(row.discountAmount) : undefined,
      paymentMemo: row.paymentMemo || "",
      memo: row.memo || "",
      salesYoY: row.salesYoY ? Number(row.salesYoY) : undefined,
      customersYoY: row.customersYoY ? Number(row.customersYoY) : undefined,
      averageSpendYoY: row.averageSpendYoY ? Number(row.averageSpendYoY) : undefined,
      budget: row.budget ? Number(row.budget) : undefined,
      achievementRate: row.achievementRate ? Number(row.achievementRate) : undefined,
      previousDate: row.previousDate || "",
      previousSales: row.previousSales ? Number(row.previousSales) : undefined,
      previousCustomers: row.previousCustomers ? Number(row.previousCustomers) : undefined,
      previousAverageSpend: row.previousAverageSpend ? Number(row.previousAverageSpend) : undefined,
      source: `CSV取込: ${row.date}`,
    }));

    try {
      const res = await fetch("/api/daily-input-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      let data: {
        ok?: boolean;
        message?: string;
        saved?: number;
        failed?: number;
        results?: Array<{ date: string; ok: boolean; message?: string }>;
      };
      try {
        data = await res.json();
      } catch {
        stopBatchTimer();
        setBatchStatus("error");
        setBatchMessage(`サーバーからの応答を解析できませんでした（HTTP ${res.status}）`);
        return;
      }

      if (!res.ok || !data.ok) {
        stopBatchTimer();
        const firstFailure = data.results?.find((r) => !r.ok);
        const detail = firstFailure?.message ? `（例: ${firstFailure.date} / ${firstFailure.message}）` : "";
        setBatchStatus(data.saved && data.saved > 0 ? "success" : "error");
        setBatchMessage(`${data.message || `保存に失敗しました（HTTP ${res.status}）`}${detail}`);
        if (data.saved && data.saved > 0) {
          setTimeout(() => window.location.reload(), 2000);
        }
        return;
      }

      stopBatchTimer();
      const totalSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setBatchStatus("success");
      setBatchMessage(
        `${data.saved}件の日次データをNotionに保存しました（${totalSec}秒）。ページを再読み込みします…`,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      stopBatchTimer();
      setBatchStatus("error");
      setBatchMessage(
        err instanceof Error
          ? `通信エラー: ${err.message}`
          : "通信エラーが発生しました。",
      );
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitStatus("Notionに保存しています...");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/daily-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          sales: Number(sales) || 0,
          customers: Number(customers) || 0,
          averageSpend: averageSpend ? Number(averageSpend) : undefined,
          grossMarginRate: Number(grossMarginRate) || 0,
          grossProfit: productSummary?.totalGrossProfit || ((Number(sales) || 0) * (Number(grossMarginRate) || 0)) / 100,
          lineRegistrations: Number(lineRegistrations) || 0,
          lineVisits: Number(lineVisits) || 0,
          salesYoY: appliedCsvAggregate?.salesYoY ? Number(appliedCsvAggregate.salesYoY) : undefined,
          customersYoY: appliedCsvAggregate?.customersYoY ? Number(appliedCsvAggregate.customersYoY) : undefined,
          averageSpendYoY: appliedCsvAggregate?.averageSpendYoY ? Number(appliedCsvAggregate.averageSpendYoY) : undefined,
          budget: appliedCsvAggregate?.budget ? Number(appliedCsvAggregate.budget) : undefined,
          achievementRate: appliedCsvAggregate?.achievementRate ? Number(appliedCsvAggregate.achievementRate) : undefined,
          previousDate: appliedCsvAggregate?.previousDates.join(" / ") || "",
          previousSales: appliedCsvAggregate?.previousSales ? Number(appliedCsvAggregate.previousSales) : undefined,
          previousCustomers: appliedCsvAggregate?.previousCustomers ? Number(appliedCsvAggregate.previousCustomers) : undefined,
          previousAverageSpend: appliedCsvAggregate?.previousAverageSpend ? Number(appliedCsvAggregate.previousAverageSpend) : undefined,
          returnsAmount: Number(returnsAmount) || 0,
          discountAmount: Number(discountAmount) || 0,
          paymentMemo,
          source,
          meoDone,
          lineDone,
          storePopDone,
          memo,
        }),
      });

      let data: { ok?: boolean; message?: string };
      try {
        data = await res.json();
      } catch {
        setError(`サーバーからの応答を解析できませんでした（HTTP ${res.status}）`);
        return;
      }

      if (!res.ok || !data.ok) {
        setError(data.message || `保存に失敗しました（HTTP ${res.status}）`);
        return;
      }

      setSubmitStatus("保存しました。ページを再読み込みします...");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      setError(
        err instanceof Error
          ? `通信エラー: ${err.message}`
          : "通信エラーが発生しました。サーバーが起動しているか確認してください。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6"
    >
      <details className="rounded-[24px] border border-dashed border-stone-900/15 bg-stone-50 px-5 py-5">
        <summary className="cursor-pointer list-none text-sm font-medium text-stone-900">
          レジCSV取込を開く
        </summary>
        <div className="mt-4 grid gap-3">
          <p className="text-sm leading-6 text-stone-600">
            レジCSV・Shift_JIS・Excelの「CSV UTF-16」・Notion／スプレッドシートの UTF-8 に対応します。日付列（当年日付／日付／日付メモ）と売上・客数が読めれば取り込めます。取り込めない場合はファイルをメモ帳で「UTF-8で保存」するか、Excelで「CSV UTF-8」形式で保存し直してください。
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await handleCsvUpload(file);
            }}
          />
          {csvRows.length > 0 ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-700">取込対象日</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCsvRowIds(csvRows.map((row) => row.id));
                      setCsvStatus(`${csvRows.length} 行を全選択しました。`);
                    }}
                    className="rounded-full border border-stone-900/10 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
                  >
                    全選択
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCsvRowIds([]);
                      setCsvStatus("選択を解除しました。");
                    }}
                    className="rounded-full border border-stone-900/10 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
                  >
                    全解除
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-2xl border border-stone-900/10 bg-white">
                {csvRows.map((row) => {
                  const isChecked = selectedCsvRowIds.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={`flex cursor-pointer items-center gap-3 border-b border-stone-100 px-4 py-3 text-sm transition-colors last:border-b-0 ${
                        isChecked ? "bg-blue-50 text-stone-900" : "text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedCsvRowIds((prev) =>
                            isChecked
                              ? prev.filter((id) => id !== row.id)
                              : [...prev, row.id],
                          );
                        }}
                        className="h-4 w-4 shrink-0 accent-blue-600"
                      />
                      <span className="truncate">{row.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCsvRows.length > 0) {
                      applyCsvRows(selectedCsvRows);
                      setCsvStatus(`${selectedCsvRows.length} 行を合算して入力欄へ反映しました。`);
                    }
                  }}
                  className="inline-flex h-fit w-fit rounded-full border border-stone-900/10 bg-white px-5 py-3 text-sm font-medium text-stone-900 hover:bg-stone-100"
                >
                  選択行を反映
                </button>
                <button
                  type="button"
                  disabled={batchStatus === "loading" || batchStatus === "success" || selectedCsvRows.length === 0}
                  onClick={handleBatchSave}
                  className={`inline-flex h-fit w-fit rounded-full px-5 py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-80 ${
                    batchStatus === "loading"
                      ? "bg-amber-600"
                      : batchStatus === "success"
                        ? "bg-emerald-600"
                        : batchStatus === "error"
                          ? "bg-rose-600 hover:bg-rose-700"
                          : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                  }`}
                >
                  {batchStatus === "loading"
                    ? `保存中… ${batchElapsedSec}秒`
                    : batchStatus === "success"
                      ? "保存完了"
                      : `選択行を日付ごとにNotionに保存（${selectedCsvRows.length}件）`}
                </button>
              </div>
            </div>
          ) : null}
          {batchMessage ? (
            <div
              className={`rounded-2xl px-4 py-4 text-sm ${
                batchStatus === "error"
                  ? "border border-rose-200 bg-rose-50 text-rose-800"
                  : batchStatus === "loading"
                    ? "border border-amber-200 bg-amber-50 text-amber-800"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {batchMessage}
            </div>
          ) : null}
          {csvStatus ? (
            <div className="rounded-2xl border border-stone-900/10 bg-white px-4 py-4 text-sm text-stone-700">
              {csvStatus}
            </div>
          ) : null}
          {selectedCsvRows.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                <p className="font-medium text-stone-900">CSV補助情報</p>
                <div className="mt-2 grid gap-1">
                  <p>選択行数: {selectedCsvRows.length}</p>
                  <p>対象日: {selectedCsvAggregate?.dates.join(" / ") || "なし"}</p>
                  <p>前年実績合計: {selectedCsvAggregate?.previousSales || "0"}</p>
                  <p>前年客数合計: {selectedCsvAggregate?.previousCustomers || "0"}</p>
                  <p>前年客単平均: {selectedCsvAggregate?.previousAverageSpend || "0"}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                <p className="font-medium text-stone-900">予算・前年比</p>
                <div className="mt-2 grid gap-1">
                  <p>当年予算合計: {selectedCsvAggregate?.budget || "0"}</p>
                  <p>当年達成率平均: {selectedCsvAggregate?.achievementRate ? `${Number(selectedCsvAggregate.achievementRate).toFixed(1)}%` : "0%"}</p>
                  <p>売上前年差異平均: {selectedCsvAggregate?.salesYoY ? `${Number(selectedCsvAggregate.salesYoY).toFixed(1)}%` : "0%"}</p>
                  <p>客数前年差平均: {selectedCsvAggregate?.customersYoY ? `${Number(selectedCsvAggregate.customersYoY).toFixed(1)}%` : "0%"}</p>
                  <p>客単価前年差平均: {selectedCsvAggregate?.averageSpendYoY ? `${Number(selectedCsvAggregate.averageSpendYoY).toFixed(1)}%` : "0%"}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </details>

      <details className="rounded-[24px] border border-dashed border-orange-300 bg-orange-50/70 px-5 py-5">
        <summary className="cursor-pointer list-none text-sm font-medium text-stone-900">
          商品分析CSV取込を開く
        </summary>
        <div className="mt-4 grid gap-3">
          <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4 text-sm text-stone-700">
            <p className="font-semibold text-stone-900">運用ルール</p>
            <div className="mt-2 grid gap-1 leading-6">
              <p>1. 売上が 0 円の日はチェックしない。</p>
              <p>2. 売上がある日だけ選び、同じ対象期間のデータだけを合算する。</p>
              <p>3. 日次売上と商品分析CSVの期間がズレる場合は、フォームに反映しない。</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-stone-600">
            `商品名 / 商品コード / カテゴリ1 / カテゴリ2 / 平均単価 / 売上数量 / 売上金額 / 構成比(%) / 粗利 / 粗利率(%)`
            を読み込みます。UTF-8、Shift_JIS、Excelの「CSV UTF-16」に対応します。
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await handleProductCsvUpload(file);
            }}
          />
          {productRows.length > 0 ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-700">集計対象商品</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductRowIds(productRows.map((row) => row.id));
                      setProductCsvStatus(`${productRows.length} 商品を全選択しました。`);
                    }}
                    className="rounded-full border border-orange-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-orange-50"
                  >
                    全選択
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductRowIds([]);
                      setProductCsvStatus("選択を解除しました。");
                    }}
                    className="rounded-full border border-orange-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-orange-50"
                  >
                    全解除
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-2xl border border-stone-900/10 bg-white">
                {productRows.map((row) => {
                  const isChecked = selectedProductRowIds.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={`flex cursor-pointer items-center gap-3 border-b border-stone-100 px-4 py-3 text-sm transition-colors last:border-b-0 ${
                        isChecked ? "bg-orange-50 text-stone-900" : "text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedProductRowIds((prev) =>
                            isChecked
                              ? prev.filter((id) => id !== row.id)
                              : [...prev, row.id],
                          );
                        }}
                        className="h-4 w-4 shrink-0 accent-orange-600"
                      />
                      <span className="truncate">{row.label}</span>
                    </label>
                  );
                })}
              </div>
              {productSummary ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canApplyProductSummary}
                    onClick={() => {
                      applyProductSummaryToForm(false);
                    }}
                    className="inline-flex h-fit w-fit rounded-full border border-orange-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    分析結果をフォームに反映
                  </button>
                  {!canApplyProductSummary ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `${productAnalysisGuard?.title ?? "警告"}\n\n${
                              productAnalysisGuard?.message ?? ""
                            }\n\nそれでも商品分析CSVの結果をフォームへ反映しますか？`,
                          )
                        ) {
                          applyProductSummaryToForm(true);
                        }
                      }}
                      className="inline-flex h-fit w-fit rounded-full border border-rose-300 bg-white px-5 py-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      警告を承知のうえで反映する
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {productCsvStatus ? (
            <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4 text-sm text-stone-700">
              {productCsvStatus}
            </div>
          ) : null}
          {productSummary ? (
            <>
              {productAnalysisGuard ? (
                <div
                  className={`rounded-2xl border px-4 py-4 text-sm ${
                    productAnalysisGuard.level === "danger"
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : productAnalysisGuard.level === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  }`}
                >
                  <p className="font-semibold">{productAnalysisGuard.title}</p>
                  <p className="mt-2 leading-6">{productAnalysisGuard.message}</p>
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                  <p className="text-xs uppercase tracking-[0.16em] text-stone-400">商品売上合計</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {productSummary.totalSales.toLocaleString()}円
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                  <p className="text-xs uppercase tracking-[0.16em] text-stone-400">想定原価合計</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {productSummary.totalEstimatedCost.toLocaleString()}円
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                  <p className="text-xs uppercase tracking-[0.16em] text-stone-400">粗利合計</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {productSummary.totalGrossProfit.toLocaleString()}円
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                  <p className="text-xs uppercase tracking-[0.16em] text-stone-400">全体粗利率</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {productSummary.overallGrossMarginRate.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                  <p className="font-medium text-stone-900">売上TOP5</p>
                  <div className="mt-2 grid gap-1">
                    {productSummary.topProducts.map((item) => (
                      <p key={item.productName}>
                        {item.productName}: {item.sales.toLocaleString()}円
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                  <p className="font-medium text-stone-900">粗利率が低い商品</p>
                  <div className="mt-2 grid gap-1">
                    {productSummary.lowMarginProducts.map((item) => (
                      <p key={`${item.productName}-${item.grossMarginRate}`}>
                        {item.productName}: {item.grossMarginRate.toFixed(1)}%
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-sm text-stone-700">
                  <p className="font-medium text-stone-900">カテゴリ売上TOP</p>
                  <div className="mt-2 grid gap-1">
                    {productSummary.topCategories.map((item) => (
                      <p key={item.name}>
                        {item.name}: {item.sales.toLocaleString()}円
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </details>

      <div className="rounded-[24px] border border-stone-900/10 bg-stone-50 px-5 py-4 text-sm text-stone-600">
        入力日: {formatDate(defaultDate)}。送信すると週次集計も自動更新します。
      </div>

      {/* hidden inputs removed — data is sent via fetch JSON body */}

      <details className="rounded-[24px] border border-stone-900/10 bg-stone-50 px-5 py-5">
        <summary className="cursor-pointer list-none text-sm font-medium text-stone-900">
          日次入力はこちらをクリック
        </summary>
        <div className="mt-4 grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-stone-700">
              日付
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-700">
              売上
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={sales}
                onChange={(event) => setSales(event.target.value)}
                placeholder="50000"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-700">
              客数
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={customers}
                onChange={(event) => setCustomers(event.target.value)}
                placeholder="40"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-700">
              客単価
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={averageSpend}
                onChange={(event) => setAverageSpend(event.target.value)}
                placeholder="空欄なら自動計算"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-700">
              粗利率(%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputMode="decimal"
                value={grossMarginRate}
                onChange={(event) => setGrossMarginRate(event.target.value)}
                placeholder="65.0"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-700">
              値引き金額
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                placeholder="0"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-700">
              取消/返品金額
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={returnsAmount}
                onChange={(event) => setReturnsAmount(event.target.value)}
                placeholder="0"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-stone-700">
              決済内訳メモ
              <input
                type="text"
                value={paymentMemo}
                onChange={(event) => setPaymentMemo(event.target.value)}
                placeholder="例: 現金 6.2万 / カード 3.1万 / QR 0.7万"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-700">
              データソース
              <input
                type="text"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="例: レジ締め / POS / 手集計"
                className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
              />
            </label>
          </div>
        </div>
      </details>

      <section className="grid gap-3">
        <p className="text-sm font-medium text-stone-700">施策実施フラグ</p>
        <div className="grid gap-3 md:grid-cols-3">
          {([
            { key: "meoDone" as const, label: "MEO", checked: meoDone, set: setMeoDone },
            { key: "lineDone" as const, label: "LINE", checked: lineDone, set: setLineDone },
            { key: "storePopDone" as const, label: "店頭POP", checked: storePopDone, set: setStorePopDone },
          ]).map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-3 rounded-2xl border border-stone-900/10 bg-white px-4 py-4 text-sm text-stone-700"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => item.set(e.target.checked)}
                className="h-4 w-4"
              />
              {item.label}
            </label>
          ))}
        </div>
      </section>

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        メモ
        <textarea
          name="memo"
          rows={5}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="所感、例外、現場メモ"
          className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {submitStatus ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          {submitStatus}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`inline-flex w-fit rounded-full px-6 py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-80 ${
            isSubmitting ? "bg-amber-600" : "bg-stone-950 hover:bg-stone-800 active:bg-stone-700"
          }`}
        >
          {isSubmitting ? "保存中..." : "日次入力を保存して週次集計を更新"}
        </button>
        {!isSubmitting && (
          <p className="text-xs text-stone-400">
            ボタンが反応しない場合 →{" "}
            <a
              href={`/api/weekly-summary-action?weekStart=${encodeURIComponent(date)}`}
              className="underline hover:text-stone-600"
            >
              週次集計だけ更新
            </a>
          </p>
        )}
      </div>
    </form>
  );
}
