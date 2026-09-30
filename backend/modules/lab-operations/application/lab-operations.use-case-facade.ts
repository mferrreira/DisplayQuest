import type {
  CreateLabEventCommand,
  CreateLabNoticeCommand,
  CreateLaboratoryScheduleCommand,
  CreateUserScheduleCommand,
  DeleteLabEventCommand,
  DeleteLabNoticeCommand,
  DeleteLaboratoryScheduleCommand,
  DeleteUserScheduleCommand,
  LabIssueQuery,
  ListLabEventsByRangeQuery,
  ListResponsibilitiesQuery,
  ListUserSchedulesQuery,
  ReplaceUserSchedulesCommand,
  StartResponsibilityCommand,
  UpdateLabEventCommand,
  UpdateLaboratoryScheduleCommand,
  UpdateUserScheduleCommand,
} from "@/backend/modules/lab-operations/application/contracts"
import type { LabOperationsGateway } from "@/backend/modules/lab-operations/application/ports/lab-operations.gateway"
import type {
  AssignIssueUseCase,
  CloseIssueUseCase,
  CreateIssueUseCase,
  DeleteIssueUseCase,
  GetIssueUseCase,
  ListIssuesUseCase,
  ReopenIssueUseCase,
  ResolveIssueUseCase,
  StartIssueProgressUseCase,
  UnassignIssueUseCase,
  UpdateIssueUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/issue.use-cases"
import type {
  CreateLabEventUseCase,
  DeleteLabEventUseCase,
  ListLabEventsByDateUseCase,
  ListLabEventsByRangeUseCase,
  UpdateLabEventUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/lab-event.use-cases"
import type {
  CreateLabNoticeUseCase,
  DeleteLabNoticeUseCase,
  ListLabNoticesUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/lab-notice.use-cases"
import type {
  CreateLaboratoryScheduleUseCase,
  DeleteLaboratoryScheduleUseCase,
  ListLaboratorySchedulesUseCase,
  UpdateLaboratoryScheduleUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/laboratory-schedule.use-cases"
import type {
  CanEndResponsibilityUseCase,
  DeleteResponsibilityUseCase,
  EndResponsibilityUseCase,
  ListResponsibilitiesUseCase,
  PauseResponsibilityUseCase,
  ResumeResponsibilityUseCase,
  StartResponsibilityUseCase,
  UpdateResponsibilityNotesUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/responsibility.use-cases"
import type {
  CreateUserScheduleUseCase,
  DeleteUserScheduleUseCase,
  GetUserScheduleUseCase,
  ListUserSchedulesUseCase,
  ReplaceUserSchedulesUseCase,
  UpdateUserScheduleUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/user-schedule.use-cases"

/**
 * OND8-B3 — implementação da porta LabOperationsGateway feita de USE CASES sobre portas
 * finas (R1/R2). É o drop-in da fachada: as rotas e o LabOperationsModule continuam
 * consumindo a MESMA interface; o DefaultLabOperationsGateway legado sai do wiring
 * (sobrevive intacto como seam do golden/contract — DEC-15, remoção em OND9-B1).
 */
export interface LabOperationsUseCases {
  listIssues: ListIssuesUseCase
  getIssue: GetIssueUseCase
  createIssue: CreateIssueUseCase
  updateIssue: UpdateIssueUseCase
  deleteIssue: DeleteIssueUseCase
  assignIssue: AssignIssueUseCase
  unassignIssue: UnassignIssueUseCase
  startIssueProgress: StartIssueProgressUseCase
  resolveIssue: ResolveIssueUseCase
  closeIssue: CloseIssueUseCase
  reopenIssue: ReopenIssueUseCase

  listLabEventsByDate: ListLabEventsByDateUseCase
  createLabEvent: CreateLabEventUseCase
  updateLabEvent: UpdateLabEventUseCase
  deleteLabEvent: DeleteLabEventUseCase
  listLabEventsByRange: ListLabEventsByRangeUseCase

  listLabNotices: ListLabNoticesUseCase
  createLabNotice: CreateLabNoticeUseCase
  deleteLabNotice: DeleteLabNoticeUseCase

  listLaboratorySchedules: ListLaboratorySchedulesUseCase
  createLaboratorySchedule: CreateLaboratoryScheduleUseCase
  updateLaboratorySchedule: UpdateLaboratoryScheduleUseCase
  deleteLaboratorySchedule: DeleteLaboratoryScheduleUseCase

  listResponsibilities: ListResponsibilitiesUseCase
  startResponsibility: StartResponsibilityUseCase
  canEndResponsibility: CanEndResponsibilityUseCase
  endResponsibility: EndResponsibilityUseCase
  updateResponsibilityNotes: UpdateResponsibilityNotesUseCase
  deleteResponsibility: DeleteResponsibilityUseCase
  pauseResponsibilityForUser: PauseResponsibilityUseCase
  resumeResponsibilityForUser: ResumeResponsibilityUseCase

  listUserSchedules: ListUserSchedulesUseCase
  getUserSchedule: GetUserScheduleUseCase
  createUserSchedule: CreateUserScheduleUseCase
  updateUserSchedule: UpdateUserScheduleUseCase
  deleteUserSchedule: DeleteUserScheduleUseCase
  replaceUserSchedules: ReplaceUserSchedulesUseCase
}

export class LabOperationsUseCaseFacade implements LabOperationsGateway {
  constructor(private readonly useCases: LabOperationsUseCases) {}

  listIssues(query?: LabIssueQuery) {
    return this.useCases.listIssues.execute(query)
  }
  getIssue(issueId: number) {
    return this.useCases.getIssue.execute(issueId)
  }
  createIssue(command: Record<string, unknown>) {
    return this.useCases.createIssue.execute(command)
  }
  updateIssue(issueId: number, command: Record<string, unknown>) {
    return this.useCases.updateIssue.execute(issueId, command)
  }
  deleteIssue(issueId: number) {
    return this.useCases.deleteIssue.execute(issueId)
  }
  assignIssue(issueId: number, assigneeId: number) {
    return this.useCases.assignIssue.execute(issueId, assigneeId)
  }
  unassignIssue(issueId: number) {
    return this.useCases.unassignIssue.execute(issueId)
  }
  startIssueProgress(issueId: number) {
    return this.useCases.startIssueProgress.execute(issueId)
  }
  resolveIssue(issueId: number, resolution?: string) {
    return this.useCases.resolveIssue.execute(issueId, resolution)
  }
  closeIssue(issueId: number) {
    return this.useCases.closeIssue.execute(issueId)
  }
  reopenIssue(issueId: number) {
    return this.useCases.reopenIssue.execute(issueId)
  }

  listLabEventsByDate(date: Date) {
    return this.useCases.listLabEventsByDate.execute(date)
  }
  createLabEvent(command: CreateLabEventCommand) {
    return this.useCases.createLabEvent.execute(command)
  }
  updateLabEvent(command: UpdateLabEventCommand) {
    return this.useCases.updateLabEvent.execute(command)
  }
  deleteLabEvent(command: DeleteLabEventCommand) {
    return this.useCases.deleteLabEvent.execute(command)
  }
  listLabEventsByRange(query: ListLabEventsByRangeQuery) {
    return this.useCases.listLabEventsByRange.execute(query)
  }

  listLabNotices() {
    return this.useCases.listLabNotices.execute()
  }
  createLabNotice(command: CreateLabNoticeCommand) {
    return this.useCases.createLabNotice.execute(command)
  }
  deleteLabNotice(command: DeleteLabNoticeCommand) {
    return this.useCases.deleteLabNotice.execute(command)
  }

  listLaboratorySchedules() {
    return this.useCases.listLaboratorySchedules.execute()
  }
  createLaboratorySchedule(command: CreateLaboratoryScheduleCommand) {
    return this.useCases.createLaboratorySchedule.execute(command)
  }
  updateLaboratorySchedule(scheduleId: number, command: UpdateLaboratoryScheduleCommand) {
    return this.useCases.updateLaboratorySchedule.execute(scheduleId, command)
  }
  deleteLaboratorySchedule(command: DeleteLaboratoryScheduleCommand) {
    return this.useCases.deleteLaboratorySchedule.execute(command)
  }

  listResponsibilities(query?: ListResponsibilitiesQuery) {
    return this.useCases.listResponsibilities.execute(query)
  }
  startResponsibility(command: StartResponsibilityCommand) {
    return this.useCases.startResponsibility.execute(command)
  }
  canEndResponsibility(actorUserId: number, responsibilityId: number) {
    return this.useCases.canEndResponsibility.execute(actorUserId, responsibilityId)
  }
  endResponsibility(responsibilityId: number, notes?: string) {
    return this.useCases.endResponsibility.execute(responsibilityId, notes)
  }
  updateResponsibilityNotes(responsibilityId: number, actorUserId: number, notes: string) {
    return this.useCases.updateResponsibilityNotes.execute(responsibilityId, actorUserId, notes)
  }
  deleteResponsibility(responsibilityId: number) {
    return this.useCases.deleteResponsibility.execute(responsibilityId)
  }
  pauseResponsibilityForUser(userId: number) {
    return this.useCases.pauseResponsibilityForUser.execute(userId)
  }
  resumeResponsibilityForUser(userId: number) {
    return this.useCases.resumeResponsibilityForUser.execute(userId)
  }

  listUserSchedules(query: ListUserSchedulesQuery) {
    return this.useCases.listUserSchedules.execute(query)
  }
  getUserSchedule(scheduleId: number) {
    return this.useCases.getUserSchedule.execute(scheduleId)
  }
  createUserSchedule(command: CreateUserScheduleCommand) {
    return this.useCases.createUserSchedule.execute(command)
  }
  updateUserSchedule(command: UpdateUserScheduleCommand) {
    return this.useCases.updateUserSchedule.execute(command)
  }
  deleteUserSchedule(command: DeleteUserScheduleCommand) {
    return this.useCases.deleteUserSchedule.execute(command)
  }
  replaceUserSchedules(command: ReplaceUserSchedulesCommand) {
    return this.useCases.replaceUserSchedules.execute(command)
  }
}
