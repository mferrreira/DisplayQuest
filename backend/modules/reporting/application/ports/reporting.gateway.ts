import type {
  ProjectHoursHistoryQuery,
  ProjectHoursQuery,
  ProjectHoursResult,
  UpsertWeeklyReportCommand,
  UserProjectHoursQuery,
  WeeklyHoursHistoryItem,
  WeeklyHoursHistoryQuery,
  WeeklyReportListQuery,
  WeeklyReportReadModel,
} from "@/backend/modules/reporting/application/contracts"

export interface ReportingGateway {
  listWeeklyReports(query: WeeklyReportListQuery): Promise<WeeklyReportReadModel[]>
  getWeeklyReportById(id: number): Promise<WeeklyReportReadModel | null>
  upsertWeeklyReport(command: UpsertWeeklyReportCommand): Promise<WeeklyReportReadModel>
  deleteWeeklyReport(id: number): Promise<void>
  getProjectHours(query: ProjectHoursQuery): Promise<ProjectHoursResult>
  getProjectWeeklyHours(projectId: number, weekStart: string): Promise<ProjectHoursResult>
  getProjectHoursHistory(query: ProjectHoursHistoryQuery): Promise<{
    projectId: number
    weeks: Array<{
      weekStart: string
      weekEnd: string
      totalHours: number
      sessionCount: number
      hoursByUser: Array<{
        userId: number
        userName: string | null
        totalHours: number
        sessions: unknown[]
      }>
    }>
    totalHours: number
    averageHoursPerWeek: number
  }>
  getUserProjectHours(query: UserProjectHoursQuery): Promise<Array<{
    projectId: number
    projectName: string
    projectStatus: string
    userHours: number
    projectTotalHours: number
    sessionCount: number
    userSessions: unknown[]
  }>>
  listWeeklyHoursHistory(query: WeeklyHoursHistoryQuery): Promise<WeeklyHoursHistoryItem[]>
  getWeeklyHoursStats(): Promise<{
    currentWeek: {
      weekStart: string
      weekEnd: string
      totalHours: number
      userCount: number
      topUsers: WeeklyHoursHistoryItem[]
    }
    last4Weeks: Array<{
      weekStart: string
      weekEnd: string
      totalHours: number
      userCount: number
    }>
  }>
  resetWeeklyHoursHistory(): Promise<Array<{
    userId: number
    userName: string
    savedHours: string
    weekStart: string
    weekEnd: string
  }>>
  createWeeklyHoursHistory(weekStart: string): Promise<Array<{
    userId: number
    userName: string
    totalHours: number
    weekStart: string
    weekEnd: string
  }>>
  getProjectStats(): Promise<Array<{
    projectId: number
    projectName: string
    projectStatus: string
    memberCount: number
    currentWeekHours: number
    currentWeekSessions: number
    members: Array<{
      userId: number
      userName: string
      roles: string[]
    }>
  }>>
}
