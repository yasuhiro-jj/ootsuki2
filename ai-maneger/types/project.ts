export interface Project {
  id: string;
  name: string;
  status: string;
  progress: number;
  startDate?: string;
  endDate?: string;
  businessType?: string;
  kpiTarget?: string;
  kpiActual?: string;
  department?: string;
  assignedAgent?: string;
  createdAt?: string;
  updatedAt: string;
  url?: string;
}

export interface ProjectUpdatePayload {
  name?: string;
  status?: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
  businessType?: string;
  kpiTarget?: string;
  kpiActual?: string;
  department?: string;
  assignedAgent?: string;
}

export interface WeeklyReviewDraft {
  projectId?: string;
  weeklyMetric: string;
  actionsTaken: string;
  result: string;
  decision: string;
  nextWeekAction: string;
}

export interface DashboardSummary {
  totalProjects: number;
  averageProgress: number;
  statusCounts: Record<string, number>;
  upcomingProjects: Project[];
  recentProjects: Project[];
}
