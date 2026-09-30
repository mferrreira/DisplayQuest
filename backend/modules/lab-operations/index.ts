import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { LabIssuePublisherPort } from "@/backend/modules/lab-operations/application/ports/lab-issue-publisher.port"
import type { IssueRepository as LabIssueRepository } from "@/backend/modules/lab-operations/application/ports/issue.repository"
import type { LabEventRepository } from "@/backend/modules/lab-operations/application/ports/lab-event.repository"
import type { LabNoticeRepository } from "@/backend/modules/lab-operations/application/ports/lab-notice.repository"
import type { LaboratoryScheduleRepository } from "@/backend/modules/lab-operations/application/ports/laboratory-schedule.repository"
import type { ResponsibilityRepository } from "@/backend/modules/lab-operations/application/ports/responsibility.repository"
import type { UserScheduleRepository } from "@/backend/modules/lab-operations/application/ports/user-schedule.repository"
import type { LabOperationsGateway } from "@/backend/modules/lab-operations/application/ports/lab-operations.gateway"
import { LabOperationsUseCaseFacade } from "@/backend/modules/lab-operations/application/lab-operations.use-case-facade"
import {
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
import {
  CreateLabEventUseCase,
  DeleteLabEventUseCase,
  ListLabEventsByDateUseCase,
  ListLabEventsByRangeUseCase,
  UpdateLabEventUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/lab-event.use-cases"
import {
  CreateLabNoticeUseCase,
  DeleteLabNoticeUseCase,
  ListLabNoticesUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/lab-notice.use-cases"
import {
  CreateLaboratoryScheduleUseCase,
  DeleteLaboratoryScheduleUseCase,
  ListLaboratorySchedulesUseCase,
  UpdateLaboratoryScheduleUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/laboratory-schedule.use-cases"
import {
  CanEndResponsibilityUseCase,
  DeleteResponsibilityUseCase,
  EndResponsibilityUseCase,
  ListResponsibilitiesUseCase,
  PauseResponsibilityUseCase,
  ResumeResponsibilityUseCase,
  StartResponsibilityUseCase,
  UpdateResponsibilityNotesUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/responsibility.use-cases"
import {
  CreateUserScheduleUseCase,
  DeleteUserScheduleUseCase,
  GetUserScheduleUseCase,
  ListUserSchedulesUseCase,
  ReplaceUserSchedulesUseCase,
  UpdateUserScheduleUseCase,
} from "@/backend/modules/lab-operations/application/use-cases/user-schedule.use-cases"
import { PrismaLabDirectory } from "@/backend/modules/lab-operations/infrastructure/adapters/prisma-lab-directory"
import { PrismaIssueRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-issue.repository"
import { PrismaLabEventRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-lab-event.repository"
import { PrismaLabNoticeRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-lab-notice.repository"
import { PrismaLaboratoryScheduleRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-laboratory-schedule.repository"
import { PrismaResponsibilityRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-responsibility.repository"
import { PrismaUserScheduleRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-user-schedule.repository"
import {
  createLabOperationsGateway,
  type LabOperationsGatewayDependencies,
} from "@/backend/modules/lab-operations/infrastructure/lab-operations.gateway"
import { createNotificationsModule } from "@/backend/modules/notifications"
import { createIdentityAccessModule } from "@/backend/modules/identity-access"

type GatewayCall<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never

export class LabOperationsModule {
  readonly listIssues: GatewayCall<LabOperationsGateway["listIssues"]>
  readonly getIssue: GatewayCall<LabOperationsGateway["getIssue"]>
  readonly createIssue: GatewayCall<LabOperationsGateway["createIssue"]>
  readonly updateIssue: GatewayCall<LabOperationsGateway["updateIssue"]>
  readonly deleteIssue: GatewayCall<LabOperationsGateway["deleteIssue"]>
  readonly assignIssue: GatewayCall<LabOperationsGateway["assignIssue"]>
  readonly unassignIssue: GatewayCall<LabOperationsGateway["unassignIssue"]>
  readonly startIssueProgress: GatewayCall<LabOperationsGateway["startIssueProgress"]>
  readonly resolveIssue: GatewayCall<LabOperationsGateway["resolveIssue"]>
  readonly closeIssue: GatewayCall<LabOperationsGateway["closeIssue"]>
  readonly reopenIssue: GatewayCall<LabOperationsGateway["reopenIssue"]>
  readonly listLabEventsByDate: GatewayCall<LabOperationsGateway["listLabEventsByDate"]>
  readonly createLabEvent: GatewayCall<LabOperationsGateway["createLabEvent"]>
  readonly updateLabEvent: GatewayCall<LabOperationsGateway["updateLabEvent"]>
  readonly deleteLabEvent: GatewayCall<LabOperationsGateway["deleteLabEvent"]>
  readonly listLabEventsByRange: GatewayCall<LabOperationsGateway["listLabEventsByRange"]>
  readonly listLabNotices: GatewayCall<LabOperationsGateway["listLabNotices"]>
  readonly createLabNotice: GatewayCall<LabOperationsGateway["createLabNotice"]>
  readonly deleteLabNotice: GatewayCall<LabOperationsGateway["deleteLabNotice"]>
  readonly listLaboratorySchedules: GatewayCall<LabOperationsGateway["listLaboratorySchedules"]>
  readonly createLaboratorySchedule: GatewayCall<LabOperationsGateway["createLaboratorySchedule"]>
  readonly updateLaboratorySchedule: GatewayCall<LabOperationsGateway["updateLaboratorySchedule"]>
  readonly deleteLaboratorySchedule: GatewayCall<LabOperationsGateway["deleteLaboratorySchedule"]>
  readonly listResponsibilities: GatewayCall<LabOperationsGateway["listResponsibilities"]>
  readonly startResponsibility: GatewayCall<LabOperationsGateway["startResponsibility"]>
  readonly canEndResponsibility: GatewayCall<LabOperationsGateway["canEndResponsibility"]>
  readonly endResponsibility: GatewayCall<LabOperationsGateway["endResponsibility"]>
  readonly updateResponsibilityNotes: GatewayCall<LabOperationsGateway["updateResponsibilityNotes"]>
  readonly deleteResponsibility: GatewayCall<LabOperationsGateway["deleteResponsibility"]>
  readonly pauseResponsibilityForUser: GatewayCall<LabOperationsGateway["pauseResponsibilityForUser"]>
  readonly resumeResponsibilityForUser: GatewayCall<LabOperationsGateway["resumeResponsibilityForUser"]>
  readonly listUserSchedules: GatewayCall<LabOperationsGateway["listUserSchedules"]>
  readonly getUserSchedule: GatewayCall<LabOperationsGateway["getUserSchedule"]>
  readonly createUserSchedule: GatewayCall<LabOperationsGateway["createUserSchedule"]>
  readonly updateUserSchedule: GatewayCall<LabOperationsGateway["updateUserSchedule"]>
  readonly deleteUserSchedule: GatewayCall<LabOperationsGateway["deleteUserSchedule"]>
  readonly replaceUserSchedules: GatewayCall<LabOperationsGateway["replaceUserSchedules"]>

  constructor(private readonly gateway: LabOperationsGateway) {
    this.listIssues = this.gateway.listIssues.bind(this.gateway)
    this.getIssue = this.gateway.getIssue.bind(this.gateway)
    this.createIssue = this.gateway.createIssue.bind(this.gateway)
    this.updateIssue = this.gateway.updateIssue.bind(this.gateway)
    this.deleteIssue = this.gateway.deleteIssue.bind(this.gateway)
    this.assignIssue = this.gateway.assignIssue.bind(this.gateway)
    this.unassignIssue = this.gateway.unassignIssue.bind(this.gateway)
    this.startIssueProgress = this.gateway.startIssueProgress.bind(this.gateway)
    this.resolveIssue = this.gateway.resolveIssue.bind(this.gateway)
    this.closeIssue = this.gateway.closeIssue.bind(this.gateway)
    this.reopenIssue = this.gateway.reopenIssue.bind(this.gateway)
    this.listLabEventsByDate = this.gateway.listLabEventsByDate.bind(this.gateway)
    this.createLabEvent = this.gateway.createLabEvent.bind(this.gateway)
    this.updateLabEvent = this.gateway.updateLabEvent.bind(this.gateway)
    this.deleteLabEvent = this.gateway.deleteLabEvent.bind(this.gateway)
    this.listLabEventsByRange = this.gateway.listLabEventsByRange.bind(this.gateway)
    this.listLabNotices = this.gateway.listLabNotices.bind(this.gateway)
    this.createLabNotice = this.gateway.createLabNotice.bind(this.gateway)
    this.deleteLabNotice = this.gateway.deleteLabNotice.bind(this.gateway)
    this.listLaboratorySchedules = this.gateway.listLaboratorySchedules.bind(this.gateway)
    this.createLaboratorySchedule = this.gateway.createLaboratorySchedule.bind(this.gateway)
    this.updateLaboratorySchedule = this.gateway.updateLaboratorySchedule.bind(this.gateway)
    this.deleteLaboratorySchedule = this.gateway.deleteLaboratorySchedule.bind(this.gateway)
    this.listResponsibilities = this.gateway.listResponsibilities.bind(this.gateway)
    this.startResponsibility = this.gateway.startResponsibility.bind(this.gateway)
    this.canEndResponsibility = this.gateway.canEndResponsibility.bind(this.gateway)
    this.endResponsibility = this.gateway.endResponsibility.bind(this.gateway)
    this.updateResponsibilityNotes = this.gateway.updateResponsibilityNotes.bind(this.gateway)
    this.deleteResponsibility = this.gateway.deleteResponsibility.bind(this.gateway)
    this.pauseResponsibilityForUser = this.gateway.pauseResponsibilityForUser.bind(this.gateway)
    this.resumeResponsibilityForUser = this.gateway.resumeResponsibilityForUser.bind(this.gateway)
    this.listUserSchedules = this.gateway.listUserSchedules.bind(this.gateway)
    this.getUserSchedule = this.gateway.getUserSchedule.bind(this.gateway)
    this.createUserSchedule = this.gateway.createUserSchedule.bind(this.gateway)
    this.updateUserSchedule = this.gateway.updateUserSchedule.bind(this.gateway)
    this.deleteUserSchedule = this.gateway.deleteUserSchedule.bind(this.gateway)
    this.replaceUserSchedules = this.gateway.replaceUserSchedules.bind(this.gateway)
  }
}

/** Ports finas da wiring NOVA (OND8-B3). Cada uma defaulta para o adapter Prisma fino. */
export interface LabOperationsModulePorts {
  issues?: LabIssueRepository
  labEvents?: LabEventRepository
  labNotices?: LabNoticeRepository
  laboratorySchedules?: LaboratoryScheduleRepository
  responsibilities?: ResponsibilityRepository
  userSchedules?: UserScheduleRepository
  directory?: LabDirectory
  publisher?: LabIssuePublisherPort
}

export interface LabOperationsModuleFactoryOptions {
  ports?: LabOperationsModulePorts
  /**
   * SEAM LEGADO (DEC-15): gateway explicito OU gatewayDependencies continuam montando o
   * DefaultLabOperationsGateway intacto — eixo do golden 8.1/contract 8.3. Sai da casa em
   * OND9-B1; o caminho padrao (sem estas opcoes) ja e a wiring nova de use cases.
   */
  gateway?: LabOperationsGateway
  gatewayDependencies?: Partial<LabOperationsGatewayDependencies>
}

/** Publisher default quando a composition root nao cabula: no-op com trace alto (padrao reporting/DEC-21). */
class UnwiredLabPublisher implements LabIssuePublisherPort {
  async publishIssueRaised(event: { issueId: number | undefined }): Promise<void> {
    console.warn(`[lab-operations] publisher nao conectado — evento LAB_ISSUE_RAISED descartado (issueId=${event.issueId}).`)
  }

  async publishIssueAssigned(event: { issueId: number | undefined }): Promise<void> {
    console.warn(`[lab-operations] publisher nao conectado — evento LAB_ISSUE_ASSIGNED descartado (issueId=${event.issueId}).`)
  }
}

export function createLabOperationsModule(options: LabOperationsModuleFactoryOptions = {}) {
  if (options.gateway || options.gatewayDependencies) {
    return new LabOperationsModule(
      options.gateway ??
        createLabOperationsGateway({
          notificationsModule: createNotificationsModule(),
          identityAccess: createIdentityAccessModule(),
          ...options.gatewayDependencies,
        }),
    )
  }

  const issues = options.ports?.issues ?? new PrismaIssueRepository()
  const labEvents = options.ports?.labEvents ?? new PrismaLabEventRepository()
  const labNotices = options.ports?.labNotices ?? new PrismaLabNoticeRepository()
  const laboratorySchedules = options.ports?.laboratorySchedules ?? new PrismaLaboratoryScheduleRepository()
  const responsibilities = options.ports?.responsibilities ?? new PrismaResponsibilityRepository()
  const userSchedules = options.ports?.userSchedules ?? new PrismaUserScheduleRepository()
  const directory = options.ports?.directory ?? new PrismaLabDirectory()
  const publisher = options.ports?.publisher ?? new UnwiredLabPublisher()

  const canEndResponsibility = new CanEndResponsibilityUseCase(responsibilities, directory)

  return new LabOperationsModule(
    new LabOperationsUseCaseFacade({
      listIssues: new ListIssuesUseCase(issues),
      getIssue: new GetIssueUseCase(issues),
      createIssue: new CreateIssueUseCase(issues, directory, publisher),
      updateIssue: new UpdateIssueUseCase(issues),
      deleteIssue: new DeleteIssueUseCase(issues),
      assignIssue: new AssignIssueUseCase(issues, directory, publisher),
      unassignIssue: new UnassignIssueUseCase(issues),
      startIssueProgress: new StartIssueProgressUseCase(issues),
      resolveIssue: new ResolveIssueUseCase(issues),
      closeIssue: new CloseIssueUseCase(issues),
      reopenIssue: new ReopenIssueUseCase(issues),

      listLabEventsByDate: new ListLabEventsByDateUseCase(labEvents),
      createLabEvent: new CreateLabEventUseCase(labEvents, directory),
      updateLabEvent: new UpdateLabEventUseCase(labEvents, directory),
      deleteLabEvent: new DeleteLabEventUseCase(labEvents, directory),
      listLabEventsByRange: new ListLabEventsByRangeUseCase(labEvents),

      listLabNotices: new ListLabNoticesUseCase(labNotices),
      createLabNotice: new CreateLabNoticeUseCase(labNotices, directory),
      deleteLabNotice: new DeleteLabNoticeUseCase(labNotices, directory),

      listLaboratorySchedules: new ListLaboratorySchedulesUseCase(laboratorySchedules),
      createLaboratorySchedule: new CreateLaboratoryScheduleUseCase(laboratorySchedules, directory),
      updateLaboratorySchedule: new UpdateLaboratoryScheduleUseCase(laboratorySchedules, directory),
      deleteLaboratorySchedule: new DeleteLaboratoryScheduleUseCase(laboratorySchedules, directory),

      listResponsibilities: new ListResponsibilitiesUseCase(responsibilities),
      startResponsibility: new StartResponsibilityUseCase(responsibilities, directory),
      canEndResponsibility,
      endResponsibility: new EndResponsibilityUseCase(responsibilities),
      updateResponsibilityNotes: new UpdateResponsibilityNotesUseCase(responsibilities, directory, canEndResponsibility),
      deleteResponsibility: new DeleteResponsibilityUseCase(responsibilities),
      pauseResponsibilityForUser: new PauseResponsibilityUseCase(responsibilities),
      resumeResponsibilityForUser: new ResumeResponsibilityUseCase(responsibilities),

      listUserSchedules: new ListUserSchedulesUseCase(userSchedules),
      getUserSchedule: new GetUserScheduleUseCase(userSchedules),
      createUserSchedule: new CreateUserScheduleUseCase(userSchedules, directory),
      updateUserSchedule: new UpdateUserScheduleUseCase(userSchedules),
      deleteUserSchedule: new DeleteUserScheduleUseCase(userSchedules),
      replaceUserSchedules: new ReplaceUserSchedulesUseCase(userSchedules),
    }),
  )
}
