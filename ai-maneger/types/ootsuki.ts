export interface OotsukiProjectOverview {
  id: string;
  name: string;
  status: string;
  kpiTarget: string;
  kpiActual: string;
  updatedAt: string;
}

export interface KpiSnapshotEntry {
  id: string;
  title: string;
  date?: string;
  weekStart: string;
  weekEnd: string;
  sales: number;
  customers: number;
  averageSpend: number;
  grossMarginRate: number;
  grossProfit: number;
  lineRegistrations: number;
  lineVisits: number;
  salesYoY?: number;
  customersYoY?: number;
  averageSpendYoY?: number;
  returnsAmount: number;
  discountAmount: number;
  notes: string;
  paymentMemo: string;
  source: string;
  createdAt: string;
}

export interface DailyInputPayload {
  date: string;
  sales: number;
  customers: number;
  averageSpend: number;
  grossMarginRate: number;
  grossProfit: number;
  lineRegistrations: number;
  lineVisits: number;
  salesYoY?: number;
  customersYoY?: number;
  averageSpendYoY?: number;
  budget?: number;
  achievementRate?: number;
  previousDate?: string;
  previousSales?: number;
  previousCustomers?: number;
  previousAverageSpend?: number;
  returnsAmount: number;
  discountAmount: number;
  paymentMemo: string;
  source: string;
  meoDone: boolean;
  lineDone: boolean;
  storePopDone: boolean;
  memo: string;
}

export interface WeeklyAggregate {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  sales: number;
  customers: number;
  averageSpend: number;
  grossMarginRate: number;
  grossProfit: number;
  lineRegistrations: number;
  lineVisits: number;
  salesWoW?: number;
  customersWoW?: number;
  averageSpendWoW?: number;
  grossMarginRateWoW?: number;
  lineRegistrationsWoW?: number;
  lineVisitsWoW?: number;
  notes: string[];
  actions: string[];
  totalDays: number;
}

export interface MemoEntry {
  id: string;
  title: string;
  date?: string;
  category: string;
  status: string;
  summary: string;
  relatedNumbers: string;
  nextAction: string;
  updatedAt: string;
  url?: string;
}

export interface WeeklyReviewDraft {
  id?: string;
  status: string;
  summary: string;
  relatedNumbers: string;
  nextActions: string[];
  duplicateCount?: number;
  updatedAt?: string;
  url?: string;
}

export interface WeeklyReviewPayload {
  weekStart: string;
  weekEnd: string;
  status: string;
  summary: string;
  relatedNumbers: string;
  nextActions: string[];
}

export interface DashboardMetricAlert {
  label: string;
  status: "ok" | "missing";
  detail: string;
}

export interface WeeklyActionPlan {
  id?: string;
  title: string;
  weekStart: string;
  weekEnd: string;
  actions: string[];
  status?: string;
  source?: string;
  updatedAt?: string;
  url?: string;
}
