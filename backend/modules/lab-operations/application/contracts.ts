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
  actorUserId: number
  actorName: string
  notes?: string
}

export interface ListUserSchedulesQuery {
  actorUserId: number
  actorRoles: string[]
  targetUserId?: number
}

export interface CreateUserScheduleCommand {
  actorUserId: number
  actorRoles: string[]
  targetUserId: number
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface UpdateUserScheduleCommand {
  actorUserId: number
  actorRoles: string[]
  scheduleId: number
  dayOfWeek?: number
  startTime?: string
  endTime?: string
}

export interface DeleteUserScheduleCommand {
  actorUserId: number
  actorRoles: string[]
  scheduleId: number
}

export interface ReplaceUserSchedulesCommand {
  actorUserId: number
  actorRoles: string[]
  targetUserId: number
  slots: { dayOfWeek: number; startTime: string; endTime: string }[]
}
