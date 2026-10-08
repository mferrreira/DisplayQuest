import type {
  ActorRef,
  Issue,
  LabEvent,
  LabNotice,
  LabResponsibility,
  LaboratorySchedule,
  UserSchedule,
} from "@/backend/domain"
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
  ListUserSchedulesQuery,
  ListResponsibilitiesQuery,
  ListLabEventsByRangeQuery,
  ReplaceUserSchedulesCommand,
  StartResponsibilityCommand,
  UpdateUserScheduleCommand,
  UpdateLaboratoryScheduleCommand,
  UpdateLabEventCommand,
} from "@/backend/modules/lab-operations/application/contracts"

export interface LabOperationsGateway {
  listIssues(query?: LabIssueQuery): Promise<Issue[]>
  getIssue(issueId: number): Promise<Issue | null>
  createIssue(command: Record<string, unknown>): Promise<Issue>
  // B6-6 (D4): as mutacoes de issue passaram a receber o ActorRef; o gate (requireIssueManager /
  // requireIssueAssigner) e dos use cases, com a mensagem congelada da rota chamadora.
  updateIssue(command: { actor: ActorRef; issueId: number; data: Record<string, unknown> }): Promise<Issue>
  deleteIssue(command: { actor: ActorRef; issueId: number }): Promise<void>
  assignIssue(command: { actor: ActorRef; issueId: number; assigneeId?: number }): Promise<Issue>
  unassignIssue(command: { actor: ActorRef; issueId: number; deniedMessage?: string }): Promise<Issue>
  startIssueProgress(command: { actor: ActorRef; issueId: number; deniedMessage?: string }): Promise<Issue>
  resolveIssue(command: { actor: ActorRef; issueId: number; resolution?: string; deniedMessage?: string }): Promise<Issue>
  closeIssue(command: { actor: ActorRef; issueId: number; deniedMessage?: string }): Promise<Issue>
  reopenIssue(command: { actor: ActorRef; issueId: number; deniedMessage?: string }): Promise<Issue>

  listLabEventsByDate(date: Date): Promise<LabEvent[]>
  createLabEvent(command: CreateLabEventCommand): Promise<LabEvent>
  updateLabEvent(command: UpdateLabEventCommand): Promise<LabEvent>
  deleteLabEvent(command: DeleteLabEventCommand): Promise<void>
  listLabEventsByRange(query: ListLabEventsByRangeQuery): Promise<LabEvent[]>
  listLabNotices(): Promise<LabNotice[]>
  createLabNotice(command: CreateLabNoticeCommand): Promise<LabNotice>
  deleteLabNotice(command: DeleteLabNoticeCommand): Promise<void>

  listLaboratorySchedules(): Promise<LaboratorySchedule[]>
  createLaboratorySchedule(command: CreateLaboratoryScheduleCommand): Promise<LaboratorySchedule>
  updateLaboratorySchedule(scheduleId: number, command: UpdateLaboratoryScheduleCommand): Promise<LaboratorySchedule>
  deleteLaboratorySchedule(command: DeleteLaboratoryScheduleCommand): Promise<void>

  listResponsibilities(query?: ListResponsibilitiesQuery): Promise<{
    activeResponsibility?: LabResponsibility | null
    responsibilities?: LabResponsibility[]
  }>
  startResponsibility(command: StartResponsibilityCommand): Promise<LabResponsibility>
  canEndResponsibility(actorUserId: number, responsibilityId: number): Promise<boolean>
  // B6-6 (D4): end/updateNotes/delete carregam o ActorRef; a checagem canEnd (antes da rota) e
  // dos use cases, com as mensagens congeladas da rota. pause/resume: ator + userId (o cron
  // opera como system para o userId da varredura; a rota, como pessoa sobre si mesma).
  endResponsibility(command: { actor: ActorRef; responsibilityId: number; notes?: string }): Promise<LabResponsibility>
  updateResponsibilityNotes(command: { actor: ActorRef; responsibilityId: number; notes: string }): Promise<LabResponsibility>
  deleteResponsibility(command: { actor: ActorRef; responsibilityId: number }): Promise<void>
  pauseResponsibilityForUser(command: { actor: ActorRef; userId: number }): Promise<LabResponsibility | null>
  resumeResponsibilityForUser(command: { actor: ActorRef; userId: number }): Promise<LabResponsibility | null>

  // B6-6 (D4): assert ANTES do parse do corpo (403-antes-dos-400 de entrada, ordem medida).
  assertCanManageUserSchedules(command: { actor: ActorRef }): void

  listUserSchedules(query: ListUserSchedulesQuery): Promise<UserSchedule[]>
  getUserSchedule(scheduleId: number): Promise<UserSchedule | null>
  createUserSchedule(command: CreateUserScheduleCommand): Promise<UserSchedule>
  updateUserSchedule(command: UpdateUserScheduleCommand): Promise<UserSchedule>
  deleteUserSchedule(command: DeleteUserScheduleCommand): Promise<void>
  replaceUserSchedules(command: ReplaceUserSchedulesCommand): Promise<UserSchedule[]>
}
