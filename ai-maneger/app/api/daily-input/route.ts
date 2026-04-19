import { NextResponse } from "next/server";
import { logTenantAudit } from "@/lib/api/audit";
import { requireTenantAccess } from "@/lib/api/tenant-access";
import { calculateAverageSpend } from "@/lib/ootsuki";
import { saveDailyInput } from "@/lib/notion/ootsuki";

interface DailyInputRequestBody {
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
  meoDone?: boolean;
  lineDone?: boolean;
  storePopDone?: boolean;
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
  const access = await requireTenantAccess(request, "write");
  if (!access.ok) return access.response;

  let body: DailyInputRequestBody;
  try {
    body = (await request.json()) as DailyInputRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON の形式が正しくありません。" }, { status: 400 });
  }

  const date = str(body.date);
  const sales = num(body.sales);
  const customers = num(body.customers);
  const grossMarginRate = num(body.grossMarginRate);
  const grossProfit =
    typeof body.grossProfit === "number" && !Number.isNaN(body.grossProfit)
      ? body.grossProfit
      : sales * (grossMarginRate / 100);
  const lineRegistrations = num(body.lineRegistrations);
  const lineVisits = num(body.lineVisits);
  const returnsAmount = num(body.returnsAmount);
  const discountAmount = num(body.discountAmount);
  const averageSpend =
    typeof body.averageSpend === "number" && !Number.isNaN(body.averageSpend)
      ? body.averageSpend
      : calculateAverageSpend(sales, customers);

  if (!date) {
    return NextResponse.json({ ok: false, message: "日付を入力してください。" }, { status: 400 });
  }

  if (sales < 0) {
    return NextResponse.json({ ok: false, message: "売上は0以上の数値で入力してください。" }, { status: 400 });
  }

  if (customers < 0) {
    return NextResponse.json({ ok: false, message: "客数は0以上の数値で入力してください。" }, { status: 400 });
  }

  try {
    console.log("[daily-input] saving…", { tenant: access.tenant, date });
    await saveDailyInput({
      date,
      sales,
      customers,
      averageSpend,
      grossMarginRate,
      grossProfit,
      lineRegistrations,
      lineVisits,
      salesYoY: body.salesYoY,
      customersYoY: body.customersYoY,
      averageSpendYoY: body.averageSpendYoY,
      budget: body.budget,
      achievementRate: body.achievementRate,
      previousDate: str(body.previousDate),
      previousSales: body.previousSales,
      previousCustomers: body.previousCustomers,
      previousAverageSpend: body.previousAverageSpend,
      returnsAmount,
      discountAmount,
      paymentMemo: str(body.paymentMemo),
      source: str(body.source, "Web日次入力"),
      meoDone: Boolean(body.meoDone),
      lineDone: Boolean(body.lineDone),
      storePopDone: Boolean(body.storePopDone),
      memo: str(body.memo),
    });
    await logTenantAudit(request, access, {
      action: "daily_input.save",
      resourceType: "daily-input",
      resourceId: date,
      metadata: { sales, customers, source: str(body.source, "Web日次入力") },
    });
    console.log("[daily-input] saved OK");

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[daily-input] error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `日次入力の保存に失敗しました: ${error.message}`
            : "日次入力の保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
