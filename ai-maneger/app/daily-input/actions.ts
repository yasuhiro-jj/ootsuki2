"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateAverageSpend } from "@/lib/ootsuki";
import { saveDailyInput } from "@/lib/notion/ootsuki";

interface DailyInputState {
  error?: string;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readOptionalNumber(formData: FormData, key: string) {
  const value = readString(formData, key);
  if (value === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export async function saveDailyInputAction(
  _previousState: DailyInputState,
  formData: FormData,
): Promise<DailyInputState> {
  const date = readString(formData, "date");
  const sales = Number(readString(formData, "sales"));
  const customers = Number(readString(formData, "customers"));
  const averageSpendRaw = readString(formData, "averageSpend");
  const grossMarginRate = Number(readString(formData, "grossMarginRate"));
  const lineRegistrations = Number(readString(formData, "lineRegistrations"));
  const lineVisits = Number(readString(formData, "lineVisits"));
  const salesYoY = readOptionalNumber(formData, "salesYoY");
  const customersYoY = readOptionalNumber(formData, "customersYoY");
  const averageSpendYoY = readOptionalNumber(formData, "averageSpendYoY");
  const budget = readOptionalNumber(formData, "budget");
  const achievementRate = readOptionalNumber(formData, "achievementRate");
  const previousDate = readString(formData, "previousDate");
  const previousSales = readOptionalNumber(formData, "previousSales");
  const previousCustomers = readOptionalNumber(formData, "previousCustomers");
  const previousAverageSpend = readOptionalNumber(formData, "previousAverageSpend");
  const returnsAmount = Number(readString(formData, "returnsAmount"));
  const discountAmount = Number(readString(formData, "discountAmount"));
  const paymentMemo = readString(formData, "paymentMemo");
  const source = readString(formData, "source");
  const memo = readString(formData, "memo");

  if (!date) {
    return { error: "日付を入力してください。" };
  }

  if (Number.isNaN(sales) || sales < 0) {
    return { error: "売上は0以上の数値で入力してください。" };
  }

  if (Number.isNaN(customers) || customers < 0) {
    return { error: "客数は0以上の数値で入力してください。" };
  }

  const averageSpend =
    averageSpendRaw === "" ? calculateAverageSpend(sales, customers) : Number(averageSpendRaw);

  if (Number.isNaN(averageSpend) || averageSpend < 0) {
    return { error: "客単価は0以上の数値で入力してください。" };
  }

  if (Number.isNaN(grossMarginRate) || grossMarginRate < 0 || grossMarginRate > 100) {
    return { error: "粗利率は0〜100の数値で入力してください。" };
  }

  if (Number.isNaN(lineRegistrations) || lineRegistrations < 0) {
    return { error: "LINE登録数は0以上の数値で入力してください。" };
  }

  if (Number.isNaN(lineVisits) || lineVisits < 0) {
    return { error: "LINE経由来店数は0以上の数値で入力してください。" };
  }

  if (Number.isNaN(returnsAmount) || returnsAmount < 0) {
    return { error: "取消/返品金額は0以上の数値で入力してください。" };
  }

  if (Number.isNaN(discountAmount) || discountAmount < 0) {
    return { error: "値引き金額は0以上の数値で入力してください。" };
  }

  const grossProfit = sales * (grossMarginRate / 100);

  try {
    await saveDailyInput({
      date,
      sales,
      customers,
      averageSpend,
      grossMarginRate,
      grossProfit,
      lineRegistrations,
      lineVisits,
      salesYoY,
      customersYoY,
      averageSpendYoY,
      budget,
      achievementRate,
      previousDate,
      previousSales,
      previousCustomers,
      previousAverageSpend,
      returnsAmount,
      discountAmount,
      paymentMemo,
      source,
      meoDone: readChecked(formData, "meoDone"),
      lineDone: readChecked(formData, "lineDone"),
      storePopDone: readChecked(formData, "storePopDone"),
      memo,
    });
  } catch (error) {
    console.error("saveDailyInputAction failed", {
      date,
      previousDate,
      source,
      error,
    });
    return {
      error:
        error instanceof Error
          ? `日次入力の保存に失敗しました: ${error.message}`
          : "日次入力の保存に失敗しました。",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/daily-input");
  revalidatePath("/reviews");
  redirect("/dashboard");
}
