import type { WorkSession } from "@/backend/models/WorkSession"
import type { DailyLog } from "@/backend/models/DailyLog"

export interface StartWorkSessionCommand {
  userId: number
  userName: string
  activity?: string
  location?: string
  projectId?: number
}

export interface CompleteWorkSessionCommand {
  sessionId: number
  actorUserId: number
  activity?: string
  location?: string
  endTime?: string
  projectId?: number | null
  completedTaskIds?: number[]
  dailyLogNote?: string
  dailyLogDate?: string
}

export interface CreateDailyLogFromSessionCommand {
  sessionId: number
  actorUserId: number
  note?: string
  date?: string
}

export interface ListWorkSessionsQuery {
  userId?: number
  status?: string
}

export interface DeleteWorkSessionCommand {
  sessionId: number
  actorUserId: number
}

export interface UpdateWorkSessionCommand {
  sessionId: number
  actorUserId: number
  activity?: string
  location?: string
  status?: string
  endTime?: string
  projectId?: number | null
  completedTaskIds?: number[]
}

export interface WorkExecutionResult {
  session: WorkSession
  dailyLog?: DailyLog
}
