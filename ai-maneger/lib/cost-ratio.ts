import type { KpiSnapshotEntry, MonthlyCostRatio, PurchaseEntry } from "@/types/ootsuki";

const COST_ACCOUNT_CATEGORIES = ["仕入高", "食材費", "飲料費"];

const TAX_RATE = 1.10;

const TARGET_GROSS_MARGIN_RATIO = 62.0;

export { COST_ACCOUNT_CATEGORIES };

export function isCostPurchase(entry: PurchaseEntry): boolean {
  return COST_ACCOUNT_CATEGORIES.includes(entry.accountCategory);
}

export function convertToTaxIncluded(salesExclTax: number): number {
  return salesExclTax * TAX_RATE;
}

export function calculateCostRatio(salesInclTax: number, purchaseAmountInclTax: number): number {
  if (salesInclTax <= 0) return 0;
  return (purchaseAmountInclTax / salesInclTax) * 100;
}

export function calculateGrossMarginRatio(costRatio: number): number {
  return 100 - costRatio;
}

export function aggregateMonthlySales(entries: KpiSnapshotEntry[]): Map<string, number> {
  const monthlyMap = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.date) continue;
    const monthKey = entry.date.slice(0, 7);
    const current = monthlyMap.get(monthKey) || 0;
    monthlyMap.set(monthKey, current + entry.sales);
  }

  return monthlyMap;
}

export function aggregateMonthlyPurchases(entries: PurchaseEntry[]): Map<string, number> {
  const monthlyMap = new Map<string, number>();

  for (const entry of entries) {
    if (!isCostPurchase(entry)) continue;
    const monthKey = entry.date.slice(0, 7);
    const current = monthlyMap.get(monthKey) || 0;
    monthlyMap.set(monthKey, current + entry.amountInclTax);
  }

  return monthlyMap;
}

export function buildMonthlyCostRatios(
  salesEntries: KpiSnapshotEntry[],
  purchaseEntries: PurchaseEntry[],
): MonthlyCostRatio[] {
  const monthlySales = aggregateMonthlySales(salesEntries);
  const monthlyPurchases = aggregateMonthlyPurchases(purchaseEntries);

  const allMonths = new Set([...monthlySales.keys(), ...monthlyPurchases.keys()]);
  const sortedMonths = Array.from(allMonths).sort((a, b) => b.localeCompare(a));

  const ratios: MonthlyCostRatio[] = [];

  for (const monthKey of sortedMonths) {
    const salesExclTax = monthlySales.get(monthKey) || 0;
    const purchaseAmountInclTax = monthlyPurchases.get(monthKey) || 0;
    const salesInclTax = convertToTaxIncluded(salesExclTax);

    const salesAvailable = salesExclTax > 0;
    const purchaseAvailable = purchaseAmountInclTax > 0;

    const costRatio =
      salesAvailable && purchaseAvailable ? calculateCostRatio(salesInclTax, purchaseAmountInclTax) : 0;
    const grossMarginRatio = calculateGrossMarginRatio(costRatio);
    const vsTarget = grossMarginRatio - TARGET_GROSS_MARGIN_RATIO;

    const [year, month] = monthKey.split("-");
    const lastYearKey = `${parseInt(year) - 1}-${month}`;

    const lastYearSalesExclTax = monthlySales.get(lastYearKey) || 0;
    const lastYearPurchaseAmountInclTax = monthlyPurchases.get(lastYearKey) || 0;
    const lastYearSalesInclTax = convertToTaxIncluded(lastYearSalesExclTax);
    const lastYearCostRatio =
      lastYearSalesInclTax > 0 && lastYearPurchaseAmountInclTax > 0
        ? calculateCostRatio(lastYearSalesInclTax, lastYearPurchaseAmountInclTax)
        : 0;
    const lastYearGrossMarginRatio = calculateGrossMarginRatio(lastYearCostRatio);

    const salesInclTaxYoY =
      salesAvailable && lastYearSalesInclTax > 0
        ? ((salesInclTax - lastYearSalesInclTax) / lastYearSalesInclTax) * 100
        : undefined;
    const purchaseAmountYoY =
      purchaseAvailable && lastYearPurchaseAmountInclTax > 0
        ? ((purchaseAmountInclTax - lastYearPurchaseAmountInclTax) / lastYearPurchaseAmountInclTax) * 100
        : undefined;
    const costRatioYoY =
      salesAvailable && purchaseAvailable && lastYearCostRatio > 0 ? costRatio - lastYearCostRatio : undefined;
    const grossMarginRatioYoY =
      salesAvailable && purchaseAvailable && lastYearGrossMarginRatio > 0
        ? grossMarginRatio - lastYearGrossMarginRatio
        : undefined;

    ratios.push({
      monthKey,
      salesExclTax,
      salesInclTax,
      purchaseAmountInclTax,
      costRatio,
      grossMarginRatio,
      salesInclTaxYoY,
      purchaseAmountYoY,
      costRatioYoY,
      grossMarginRatioYoY,
      targetGrossMarginRatio: TARGET_GROSS_MARGIN_RATIO,
      vsTarget,
      dataStatus: {
        salesAvailable,
        purchaseAvailable,
      },
    });
  }

  return ratios;
}

export function formatCostRatioStatus(ratio: MonthlyCostRatio): "good" | "watch" | "urgent" | "unavailable" {
  if (!ratio.dataStatus.salesAvailable || !ratio.dataStatus.purchaseAvailable) {
    return "unavailable";
  }

  const vsTarget = ratio.vsTarget;

  if (vsTarget >= 0) {
    return "good";
  } else if (vsTarget >= -2) {
    return "watch";
  } else {
    return "urgent";
  }
}
