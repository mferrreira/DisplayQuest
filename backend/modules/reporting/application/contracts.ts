import type { ActorRef } from "@/backend/domain"
import type { ReportPeriod } from "@/backend/domain/reporting"

/**
 * B6-3 (D4): as entradas das rotas de relatórios semanais passaram a levar o `ActorRef` —
 * a autoridade (regra composta MANAGE_USERS||LABORATORISTA, self-or-view, MANAGE_USERS puro
 * no histórico de horas e no bulk) morava nas rotas com `hasPermission`/`ensure*`.
 */
export interface WeeklyReportListQuery {
  actor: ActorRef
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
  /** B6-4 (D4): self || MANAGE_USERS (mensagem default) — a rota gateava com ensureSelfOrPermission. */
  actor: ActorRef
  userId: number
  weekStart?: string
  weekEnd?: string
}

export interface WeeklyHoursHistoryQuery {
  actor: ActorRef
  weekStart?: string
  userId?: number
}

export interface UpsertWeeklyReportCommand {
  actor: ActorRef
  userId: number
  weekStart: string
  weekEnd: string
  summary?: string | null
}

export interface BulkGenerateWeeklyReportsCommand {
  actor: ActorRef
  periodType: ReportPeriod
  from: string
  to: string
}

export interface BulkWeeklyReportPeriodResult {
  label: string
  start: string
  end: string
  reports: number
}

export interface BulkGenerateWeeklyReportsResult {
  periodCount: number
  reportCount: number
  periods: BulkWeeklyReportPeriodResult[]
}

export interface WeeklyReportSessionLog {
  id: number
  userId: number
  projectId: number | null
  startTime: string
  endTime: string | null
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

export type ProjectReportPeriodType = "weekly" | "biweekly" | "monthly" | "semiannual" | "annual"

export interface CreateProjectReportCommand {
  actorUserId: number
  actorRoles: string[]
  projectId: number
  periodType: ProjectReportPeriodType
  reference?: string
  title?: string | null
  content: string
}

export interface UpdateProjectReportCommand {
  actorUserId: number
  actorRoles: string[]
  reportId: number
  title?: string | null
  content?: string
}

export interface DeleteProjectReportCommand {
  actorUserId: number
  actorRoles: string[]
  reportId: number
}

export interface ListProjectReportsQuery {
  actorUserId: number
  actorRoles: string[]
  projectId?: number
  periodType?: ProjectReportPeriodType
  from?: string
  to?: string
  authorId?: number
}

export interface RegisterReportAttachmentCommand {
  actorUserId: number
  actorRoles: string[]
  reportId: number
  fileName: string
  storedPath: string
  mimeType: string
  sizeBytes: number
}

export interface DeleteReportAttachmentCommand {
  actorUserId: number
  actorRoles: string[]
  attachmentId: number
}

export interface ProjectReportAttachmentDto {
  id: number
  fileName: string
  storedPath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface ProjectReportReadModel {
  id: number
  projectId: number
  projectName: string
  authorId: number
  authorName: string
  periodType: ProjectReportPeriodType
  periodLabel: string
  periodStart: string
  periodEnd: string
  title: string | null
  content: string
  createdAt: string
  updatedAt: string
  attachments: ProjectReportAttachmentDto[]
}

export interface ProjectReportAggregateResult {
  report: ProjectReportReadModel
  logs: Array<{
    id: number
    userId: number
    userName: string | null
    date: string
    startTime: string | null
    endTime: string | null
    note: string | null
    projectName: string | null
  }>
  sessions: Array<{
    id: number
    userId: number
    userName: string
    startTime: string
    endTime: string | null
    durationHours: number | null
    activity: string | null
    location: string | null
  }>
  totals: {
    logCount: number
    sessionCount: number
    totalHours: number
  }
}
