/**
 * Query key factory — single source for every cache key (spec/state-management.md).
 * Hierarchical: invalidating `queryKeys.tasks.all` hits every task list/detail/progress key.
 */
import type { TaskFilters } from "@/lib/api/endpoints/tasks";

// Placeholder param types until each domain's epic defines its filter contracts.
export type ProjectFilters = Record<string, unknown>;
export type UserListParams = Record<string, unknown>;
export type WorkSessionListParams = Record<string, unknown>;
export type RewardListParams = Record<string, unknown>;
export type PurchaseListParams = Record<string, unknown>;
export type ResponsibilityListParams = Record<string, unknown>;
export type IssueListParams = Record<string, unknown>;
export type WeeklyReportListParams = Record<string, unknown>;
export type ProjectReportListParams = Record<string, unknown>;
export type NotificationListParams = Record<string, unknown>;
export interface WeekRange {
  weekStart: string;
  weekEnd: string;
}

export const queryKeys = {
  tasks: {
    all: ["tasks"] as const,
    lists: () => [...queryKeys.tasks.all, "list"] as const,
    list: (filters: TaskFilters = {}) => [...queryKeys.tasks.lists(), filters] as const,
    details: () => [...queryKeys.tasks.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.tasks.details(), id] as const,
    progress: (userId: number) => [...queryKeys.tasks.all, "progress", userId] as const,
  },

  projects: {
    all: ["projects"] as const,
    lists: () => [...queryKeys.projects.all, "list"] as const,
    list: (filters: ProjectFilters = {}) => [...queryKeys.projects.lists(), filters] as const,
    details: () => [...queryKeys.projects.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.projects.details(), id] as const,
    members: (projectId: number) => [...queryKeys.projects.detail(projectId), "members"] as const,
    hours: (projectId: number, week: WeekRange) =>
      [...queryKeys.projects.detail(projectId), "hours", week] as const,
    volunteers: (projectId: number) =>
      [...queryKeys.projects.detail(projectId), "volunteers"] as const,
    stats: () => [...queryKeys.projects.all, "stats"] as const,
  },

  users: {
    all: ["users"] as const,
    lists: () => [...queryKeys.users.all, "list"] as const,
    list: (params: UserListParams = {}) => [...queryKeys.users.lists(), params] as const,
    details: () => [...queryKeys.users.all, "detail"] as const,
    detail: (id: number) => [...queryKeys.users.details(), id] as const,
    profile: (id: number) => [...queryKeys.users.detail(id), "profile"] as const,
    leaderboard: (type: "points" | "tasks", limit?: number) =>
      [...queryKeys.users.all, "leaderboard", type, limit] as const,
    statistics: (type: string) => [...queryKeys.users.all, "statistics", type] as const,
    pending: () => [...queryKeys.users.all, "pending"] as const,
  },

  workSessions: {
    all: ["workSessions"] as const,
    lists: () => [...queryKeys.workSessions.all, "list"] as const,
    list: (params: WorkSessionListParams = {}) => [...queryKeys.workSessions.lists(), params] as const,
    active: (userId?: number) => [...queryKeys.workSessions.all, "active", userId ?? "self"] as const,
    detail: (id: number) => [...queryKeys.workSessions.all, "detail", id] as const,
  },

  rewards: {
    all: ["rewards"] as const,
    lists: () => [...queryKeys.rewards.all, "list"] as const,
    list: (params: RewardListParams = {}) => [...queryKeys.rewards.lists(), params] as const,
    detail: (id: number) => [...queryKeys.rewards.all, "detail", id] as const,
  },

  purchases: {
    all: ["purchases"] as const,
    lists: () => [...queryKeys.purchases.all, "list"] as const,
    list: (params: PurchaseListParams = {}) => [...queryKeys.purchases.lists(), params] as const,
    pending: () => [...queryKeys.purchases.all, "pending"] as const,
  },

  lab: {
    responsibilities: {
      all: ["lab", "responsibilities"] as const,
      list: (params: ResponsibilityListParams = {}) =>
        [...queryKeys.lab.responsibilities.all, "list", params] as const,
      active: () => [...queryKeys.lab.responsibilities.all, "active"] as const,
    },
    schedules: {
      all: ["lab", "schedules"] as const,
      list: () => [...queryKeys.lab.schedules.all, "list"] as const,
    },
    userSchedules: {
      all: ["lab", "userSchedules"] as const,
      list: (userId?: number) =>
        [...queryKeys.lab.userSchedules.all, "list", userId ?? "self"] as const,
    },
    events: {
      all: ["lab", "events"] as const,
      list: (date?: string) => [...queryKeys.lab.events.all, "list", date ?? "all"] as const,
      upcoming: (days: number) => [...queryKeys.lab.events.all, "upcoming", days] as const,
    },
    notices: {
      all: ["lab", "notices"] as const,
      list: () => [...queryKeys.lab.notices.all, "list"] as const,
    },
  },

  issues: {
    all: ["issues"] as const,
    lists: () => [...queryKeys.issues.all, "list"] as const,
    list: (params: IssueListParams = {}) => [...queryKeys.issues.lists(), params] as const,
    detail: (id: number) => [...queryKeys.issues.all, "detail", id] as const,
  },

  reports: {
    weekly: {
      all: ["reports", "weekly"] as const,
      list: (params: WeeklyReportListParams = {}) =>
        [...queryKeys.reports.weekly.all, "list", params] as const,
      detail: (id: number) => [...queryKeys.reports.weekly.all, "detail", id] as const,
    },
    projects: {
      all: ["reports", "projects"] as const,
      list: (params: ProjectReportListParams = {}) =>
        [...queryKeys.reports.projects.all, "list", params] as const,
      detail: (id: number) => [...queryKeys.reports.projects.all, "detail", id] as const,
    },
  },

  badges: {
    all: ["badges"] as const,
    lists: () => [...queryKeys.badges.all, "list"] as const,
    list: () => [...queryKeys.badges.lists()] as const,
    detail: (id: number) => [...queryKeys.badges.all, "detail", id] as const,
    userBadges: (userId: number, limit?: number) =>
      [...queryKeys.badges.all, "user", userId, limit] as const,
  },

  notifications: {
    all: ["notifications"] as const,
    list: (params: NotificationListParams = {}) =>
      [...queryKeys.notifications.all, "list", params] as const,
    unreadCount: () => [...queryKeys.notifications.all, "unreadCount"] as const,
  },
} as const;
