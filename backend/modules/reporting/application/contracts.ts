export interface WeeklyReportListQuery {
  userId?: number
  weekStart?: string
  weekEnd?: string
}

export interface ProjectHoursQuery {
  projectId: number
  weekStart?: string
  weekEnd?: string
}

export interface ProjectHoursHistoryQuery {
  projectId: number
  months?: number
}

export interface UserProjectHoursQuery {
  userId: number
  weekStart?: string
  weekEnd?: string
}

export interface WeeklyHoursHistoryQuery {
  weekStart?: string
  userId?: number
}

export interface UpsertWeeklyReportCommand {
  userId: number
  weekStart: string
  weekEnd: string
  summary?: string | null
}

export interface WeeklyReportSessionLog {
  id: number
  userId: number
  projectId: number | null
  date: string
  note: string | null
  createdAt: string
  project: {
    id: number
    name: string
  } | null
}

export interface WeeklyReportReadModel {
  id: number
  userId: number
  userName: string
  weekStart: string
  weekEnd: string
  totalLogs: number
  summary: string | null
  createdAt: string
  logs?: WeeklyReportSessionLog[]
}

export interface ProjectHoursResult {
  projectId: number
  totalHours: number
  sessionCount: number
  hoursByUser: Array<{
    userId: number
    userName: string | null
    totalHours: number
    sessions: unknown[]
  }>
  sessions: Array<{
    id: number
    userId: number
    userName: string
    startTime: string
    endTime: string | null
    duration: number | null
    activity: string | null
    location: string | null
    linkedTasks: Array<{
      id: number
      title: string
      completed: boolean
      projectId: number | null
      points: number
    }>
  }>
}

export interface WeeklyHoursHistoryItem {
  id: number
  userId: number
  userName: string
  weekStart: string
  weekEnd: string
  totalHours: number
  createdAt: string
  user?: {
    id: number
    name: string
    email: string
    roles: string[]
  }
}
