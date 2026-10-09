import type { ActorRef } from "@/backend/domain"

export interface LabIssueQuery {
  status?: string
  priority?: string
  category?: string
  reporterId?: number
  assigneeId?: number
  search?: string
}

export interface CreateLabEventCommand {
  userId: number
  userName: string
  date: Date
  note: string
}

export interface DeleteLabEventCommand {
  eventId: number
  actorUserId: number
  actorRoles: string[]
}

export interface UpdateLabEventCommand {
  eventId: number
  actorUserId: number
  actorRoles: string[]
  date?: Date
  note?: string
}

export interface ListLabEventsByRangeQuery {
  startDate: Date
  endDate: Date
}

export interface CreateLabNoticeCommand {
  userId: number
  userName: string
  note: string
}

export interface DeleteLabNoticeCommand {
  noticeId: number
  actorUserId: number
  actorRoles: string[]
}

export interface CreateLaboratoryScheduleCommand {
  dayOfWeek: number
  startTime: string
  endTime: string
  notes?: string
  userId?: number
}

export interface UpdateLaboratoryScheduleCommand {
  dayOfWeek?: number
  startTime?: string
  endTime?: string
  notes?: string
  userId?: number
}

export interface DeleteLaboratoryScheduleCommand {
  scheduleId: number
  userId?: number
}

export interface ListResponsibilitiesQuery {
  activeOnly?: boolean
  startDate?: Date
  endDate?: Date
}

export interface StartResponsibilityCommand {
  // B6-6 (D4): ator tipado; actorName segue sendo o nome da SESSAO (a rota entrega auth.actor.name).
  actor: ActorRef
  actorName: string
  notes?: string
}

export interface ListUserSchedulesQuery {
  actor: ActorRef
  targetUserId?: number
}

export interface CreateUserScheduleCommand {
  actor: ActorRef
  targetUserId: number
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface UpdateUserScheduleCommand {
  actor: ActorRef
  scheduleId: number
  dayOfWeek?: number
  startTime?: string
  endTime?: string
}

export interface DeleteUserScheduleCommand {
  actor: ActorRef
  scheduleId: number
}

export interface ReplaceUserSchedulesCommand {
  actor: ActorRef
  targetUserId: number
  slots: { dayOfWeek: number; startTime: string; endTime: string }[]
}
