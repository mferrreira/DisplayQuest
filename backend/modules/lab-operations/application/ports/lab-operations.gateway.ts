import type { Issue } from "@/backend/models/Issue"
import type { LabEvent } from "@/backend/models/LabEvent"
import type { LaboratorySchedule } from "@/backend/models/LaboratorySchedule"
import type { LabResponsibility } from "@/backend/models/LabResponsibility"
import type { UserSchedule } from "@/backend/models/UserSchedule"
import type {
  CreateLabEventCommand,
  CreateLaboratoryScheduleCommand,
  CreateUserScheduleCommand,
  DeleteUserScheduleCommand,
  LabIssueQuery,
  ListUserSchedulesQuery,
  ListResponsibilitiesQuery,
  StartResponsibilityCommand,
  UpdateUserScheduleCommand,
  UpdateLaboratoryScheduleCommand,
} from "@/backend/modules/lab-operations/application/contracts"

export interface LabOperationsGateway {
  listIssues(query?: LabIssueQuery): Promise<Issue[]>
  getIssue(issueId: number): Promise<Issue | null>
  createIssue(command: Record<string, unknown>): Promise<Issue>
  updateIssue(issueId: number, command: Record<string, unknown>): Promise<Issue>
  deleteIssue(issueId: number): Promise<void>
  assignIssue(issueId: number, assigneeId: number): Promise<Issue>
  unassignIssue(issueId: number): Promise<Issue>
  startIssueProgress(issueId: number): Promise<Issue>
  resolveIssue(issueId: number, resolution?: string): Promise<Issue>
  closeIssue(issueId: number): Promise<Issue>
  reopenIssue(issueId: number): Promise<Issue>

  listLabEventsByDate(date: Date): Promise<LabEvent[]>
  createLabEvent(command: CreateLabEventCommand): Promise<LabEvent>

  listLaboratorySchedules(): Promise<LaboratorySchedule[]>
  createLaboratorySchedule(command: CreateLaboratoryScheduleCommand): Promise<LaboratorySchedule>
  updateLaboratorySchedule(scheduleId: number, command: UpdateLaboratoryScheduleCommand): Promise<LaboratorySchedule>
  deleteLaboratorySchedule(scheduleId: number): Promise<void>

  listResponsibilities(query?: ListResponsibilitiesQuery): Promise<{
    activeResponsibility?: LabResponsibility | null
    responsibilities?: LabResponsibility[]
  }>
  startResponsibility(command: StartResponsibilityCommand): Promise<LabResponsibility>
  canEndResponsibility(actorUserId: number, responsibilityId: number): Promise<boolean>
  endResponsibility(responsibilityId: number, notes?: string): Promise<LabResponsibility>
  updateResponsibilityNotes(responsibilityId: number, actorUserId: number, notes: string): Promise<LabResponsibility>
  deleteResponsibility(responsibilityId: number): Promise<void>

  listUserSchedules(query: ListUserSchedulesQuery): Promise<UserSchedule[]>
  getUserSchedule(scheduleId: number): Promise<UserSchedule | null>
  createUserSchedule(command: CreateUserScheduleCommand): Promise<UserSchedule>
  updateUserSchedule(command: UpdateUserScheduleCommand): Promise<UserSchedule>
  deleteUserSchedule(command: DeleteUserScheduleCommand): Promise<void>
}
