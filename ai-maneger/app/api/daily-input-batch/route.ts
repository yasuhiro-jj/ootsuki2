import { NextResponse } from "next/server";
import { calculateAverageSpend } from "@/lib/ootsuki";
import { saveDailyInputBatch } from "@/lib/notion/ootsuki";
import type { DailyInputPayload } from "@/types/ootsuki";

interface RowInput {
  date?: string;
  sales?: number;
  customers?: number;
  averageSpend?: number;
  grossMarginRate?: number;
  grossProfit?: number;
  lineRegistrations?: number;
  lineVisits?: number;
  salesYoY?: number;
  customersYoY?: number;
  averageSpendYoY?: number;
  budget?: number;
  achievementRate?: number;
  previousDate?: string;
  previousSales?: number;
  previousCustomers?: number;
  previousAverageSpend?: number;
  returnsAmount?: number;
  discountAmount?: number;
  paymentMemo?: string;
  source?: string;
  memo?: string;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return value;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function POST(request: Request) {
  let body: { rows?: RowInput[] };
  try {
    body = (await request.json()) as { rows?: RowInput[] };
  } catch {
    return NextResponse.json({ ok: false, message: "JSONの形式が正しくありません。" }, { status: 400 });
  }

  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ ok: false, message: "保存する行がありません。" }, { status: 400 });
  }

  if (rows.length > 31) {
    return NextResponse.json({ ok: false, message: "一度に保存できるのは31行までです。" }, { status: 400 });
  }

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  const payloads: DailyInputPayload[] = [];
  for (const row of rows) {
    const date = str(row.date);
    if (!date || !ISO_DATE.test(date)) continue;

    const sales = num(row.sales);
    const customers = num(row.customers);
    const averageSpend =
      typeof row.averageSpend === "number" && !Number.isNaN(row.averageSpend)
        ? row.averageSpend
        : calculateAverageSpend(sales, customers);
    const grossMarginRate = num(row.grossMarginRate);
    const grossProfit =
      typeof row.grossProfit === "number" && !Number.isNaN(row.grossProfit)
        ? row.grossProfit
        : sales * (grossMarginRate / 100);

    payloads.push({
      date,
      sales,
      customers,
      averageSpend,
      grossMarginRate,
      grossProfit,
      lineRegistrations: num(row.lineRegistrations),
      lineVisits: num(row.lineVisits),
      salesYoY: row.salesYoY,
      customersYoY: row.customersYoY,
      averageSpendYoY: row.averageSpendYoY,
      budget: row.budget,
      achievementRate: row.achievementRate,
      previousDate: str(row.previousDate),
      previousSales: row.previousSales,
      previousCustomers: row.previousCustomers,
      previousAverageSpend: row.previousAverageSpend,
      returnsAmount: num(row.returnsAmount),
      discountAmount: num(row.discountAmount),
      paymentMemo: str(row.paymentMemo),
      source: str(row.source, "CSV一括取込"),
      meoDone: false,
      lineDone: false,
      storePopDone: false,
      memo: str(row.memo),
    });
  }

  if (payloads.length === 0) {
    return NextResponse.json({ ok: false, message: "有効な日付の行がありません。" }, { status: 400 });
  }

  try {
    console.log(`[daily-input-batch] saving ${payloads.length} rows…`);
    const results = await saveDailyInputBatch(payloads);
    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    console.log(`[daily-input-batch] done: ${succeeded} OK, ${failed.length} failed`);

    return NextResponse.json({
      ok: failed.length === 0,
      saved: succeeded,
      failed: failed.length,
      total: results.length,
      results,
      message:
        failed.length === 0
          ? `${succeeded}件の日次データを保存しました。`
          : `${succeeded}件保存、${failed.length}件失敗しました。`,
    });
  } catch (error) {
    console.error("[daily-input-batch] error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `一括保存に失敗しました: ${error.message}`
            : "一括保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
