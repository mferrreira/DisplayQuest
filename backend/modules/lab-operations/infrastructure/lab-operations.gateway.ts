import { LabEventService } from "@/backend/services/LabEventService"
import { LaboratoryScheduleService } from "@/backend/services/LaboratoryScheduleService"
import { LabResponsibilityService } from "@/backend/services/LabResponsibilityService"
import { UserScheduleService } from "@/backend/services/UserScheduleService"
import { LabResponsibilityRepository } from "@/backend/repositories/LabResponsibilityRepository"
import { UserScheduleRepository } from "@/backend/repositories/UserScheduleRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import { IssueRepository } from "@/backend/repositories/IssueRepository"
import { LabEventRepository } from "@/backend/repositories/LabEventRepository"
import { LaboratoryScheduleRepository } from "@/backend/repositories/LaboratoryScheduleRepository"
import { IssueService } from "@/backend/services/IssueService"
import { createNotificationsModule, type NotificationsModule } from "@/backend/modules/notifications"
import type { Issue } from "@/backend/models/Issue"
import { hasPermission } from "@/lib/auth/rbac"
import type {
  CreateLabEventCommand,
  CreateLaboratoryScheduleCommand,
  CreateUserScheduleCommand,
  DeleteUserScheduleCommand,
  LabIssueQuery,
  ListResponsibilitiesQuery,
  ListUserSchedulesQuery,
  StartResponsibilityCommand,
  UpdateLaboratoryScheduleCommand,
  UpdateUserScheduleCommand,
} from "@/backend/modules/lab-operations/application/contracts"
import type { LabOperationsGateway } from "@/backend/modules/lab-operations/application/ports/lab-operations.gateway"

export class DefaultLabOperationsGateway implements LabOperationsGateway {
  constructor(
    private readonly issueService: IssueService,
    private readonly notificationsModule: NotificationsModule,
    private readonly userRepository: UserRepository,
    private readonly labEventService: LabEventService,
    private readonly laboratoryScheduleService: LaboratoryScheduleService,
    private readonly labResponsibilityService: LabResponsibilityService,
    private readonly userScheduleService: UserScheduleService,
  ) {}

  async listIssues(query?: LabIssueQuery) {
    if (query && Object.values(query).some((value) => value !== undefined && value !== null && value !== "")) {
      return await this.issueService.searchIssues(query)
    }
    return await this.issueService.findAll()
  }

  async getIssue(issueId: number) {
    return await this.issueService.findById(issueId)
  }

  async createIssue(command: Record<string, unknown>) {
    const issue = await this.issueService.create(command)
    await this.notifyIssueRaised(issue)
    return issue
  }

  async updateIssue(issueId: number, command: Record<string, unknown>) {
    return await this.issueService.update(issueId, command)
  }

  async deleteIssue(issueId: number) {
    await this.issueService.delete(issueId)
  }

  async assignIssue(issueId: number, assigneeId: number) {
    const issue = await this.issueService.assignIssue(issueId, assigneeId)
    await this.notifyIssueAssigned(issue, assigneeId)
    return issue
  }

  async unassignIssue(issueId: number) {
    return await this.issueService.unassignIssue(issueId)
  }

  async startIssueProgress(issueId: number) {
    return await this.issueService.startProgress(issueId)
  }

  async resolveIssue(issueId: number, resolution?: string) {
    return await this.issueService.resolveIssue(issueId, resolution)
  }

  async closeIssue(issueId: number) {
    return await this.issueService.closeIssue(issueId)
  }

  async reopenIssue(issueId: number) {
    return await this.issueService.reopenIssue(issueId)
  }

  async listLabEventsByDate(date: Date) {
    return await this.labEventService.getEventsByDate(date)
  }

  async createLabEvent(command: CreateLabEventCommand) {
    return await this.labEventService.create(command as any)
  }

  async listLaboratorySchedules() {
    return await this.laboratoryScheduleService.findAll()
  }

  async createLaboratorySchedule(command: CreateLaboratoryScheduleCommand) {
    return await this.laboratoryScheduleService.create(command as any)
  }

  async updateLaboratorySchedule(scheduleId: number, command: UpdateLaboratoryScheduleCommand) {
    return await this.laboratoryScheduleService.update(scheduleId, command as any)
  }

  async deleteLaboratorySchedule(scheduleId: number) {
    await this.laboratoryScheduleService.delete(scheduleId)
  }

  async listResponsibilities(query?: ListResponsibilitiesQuery) {
    if (query?.activeOnly) {
      return {
        activeResponsibility: await this.labResponsibilityService.getActiveResponsibility(),
      }
    }

    if (query?.startDate && query?.endDate) {
      return {
        responsibilities: await this.labResponsibilityService.getResponsibilitiesByDateRange(query.startDate, query.endDate),
      }
    }

    return {
      responsibilities: await this.labResponsibilityService.findAll(),
    }
  }

  async startResponsibility(command: StartResponsibilityCommand) {
    return await this.labResponsibilityService.startResponsibility(
      command.actorUserId,
      command.actorName,
      command.notes || "",
    )
  }

  async canEndResponsibility(actorUserId: number, responsibilityId: number) {
    return await this.labResponsibilityService.canUserEndResponsibility(actorUserId, responsibilityId)
  }

  async endResponsibility(responsibilityId: number, notes?: string) {
    return await this.labResponsibilityService.endResponsibility(responsibilityId, notes)
  }

  async updateResponsibilityNotes(responsibilityId: number, actorUserId: number, notes: string) {
    return await this.labResponsibilityService.update(responsibilityId, {
      userId: actorUserId,
      notes,
    })
  }

  async deleteResponsibility(responsibilityId: number) {
    await this.labResponsibilityService.delete(responsibilityId)
  }

  async listUserSchedules(query: ListUserSchedulesQuery) {
    const canManageSchedules = hasPermission(query.actorRoles, "MANAGE_USERS")

    if (query.targetUserId) {
      if (!canManageSchedules && query.targetUserId !== query.actorUserId) {
        throw new Error("Acesso negado")
      }
      return await this.userScheduleService.getSchedulesByUser(query.targetUserId)
    }

    if (canManageSchedules) {
      return await this.userScheduleService.findAll()
    }

    return await this.userScheduleService.getSchedulesByUser(query.actorUserId)
  }

  async getUserSchedule(scheduleId: number) {
    return await this.userScheduleService.findById(scheduleId)
  }

  async createUserSchedule(command: CreateUserScheduleCommand) {
    const canManageSchedules = hasPermission(command.actorRoles, "MANAGE_USERS")
    if (!canManageSchedules && command.targetUserId !== command.actorUserId) {
      throw new Error("Acesso negado")
    }

    return await this.userScheduleService.create({
      userId: command.targetUserId,
      dayOfWeek: command.dayOfWeek,
      startTime: command.startTime,
      endTime: command.endTime,
    } as any)
  }

  async updateUserSchedule(command: UpdateUserScheduleCommand) {
    const existing = await this.userScheduleService.findById(command.scheduleId)
    if (!existing) {
      throw new Error("Horário não encontrado")
    }

    const canManageSchedules = hasPermission(command.actorRoles, "MANAGE_USERS")
    if (!canManageSchedules && existing.userId !== command.actorUserId) {
      throw new Error("Acesso negado")
    }

    return await this.userScheduleService.update(command.scheduleId, {
      userId: existing.userId,
      dayOfWeek: command.dayOfWeek,
      startTime: command.startTime,
      endTime: command.endTime,
    } as any)
  }

  async deleteUserSchedule(command: DeleteUserScheduleCommand) {
    const existing = await this.userScheduleService.findById(command.scheduleId)
    if (!existing) {
      throw new Error("Horário não encontrado")
    }

    const canManageSchedules = hasPermission(command.actorRoles, "MANAGE_USERS")
    if (!canManageSchedules && existing.userId !== command.actorUserId) {
      throw new Error("Acesso negado")
    }

    await this.userScheduleService.delete(command.scheduleId)
  }

  private async notifyIssueRaised(issue: Issue) {
    try {
      const candidates = await this.userRepository.findWithRoles(["LABORATORISTA", "COORDENADOR", "GERENTE"])
      const recipients = candidates
        .filter((user) => user.id && user.status === "active" && user.id !== issue.reporterId)
        .map((user) => user.id!)

      if (recipients.length === 0) return

      await this.notificationsModule.publishEvent({
        eventType: "LAB_ISSUE_RAISED",
        title: "Nova issue do laboratório",
        message: `A issue "${issue.title}" foi reportada e precisa de acompanhamento.`,
        data: {
          issueId: issue.id,
          title: issue.title,
          priority: issue.priority,
          reporterId: issue.reporterId,
        },
        audience: { mode: "USER_IDS", userIds: recipients },
        triggeredByUserId: issue.reporterId,
      })
    } catch (error) {
      console.error("Erro ao publicar notificação de issue reportada:", error)
    }
  }

  private async notifyIssueAssigned(issue: Issue, assigneeId: number) {
    try {
      await this.notificationsModule.publishEvent({
        eventType: "LAB_ISSUE_ASSIGNED",
        title: "Issue atribuída a você",
        message: `Você foi designado para resolver a issue "${issue.title}".`,
        data: {
          issueId: issue.id,
          title: issue.title,
          priority: issue.priority,
        },
        audience: { mode: "USER_IDS", userIds: [assigneeId] },
      })
    } catch (error) {
      console.error("Erro ao publicar notificação de issue atribuída:", error)
    }
  }
}

export function createLabOperationsGateway() {
  const userRepository = new UserRepository()
  const issueService = new IssueService(
    new IssueRepository(),
    userRepository,
  )

  return new DefaultLabOperationsGateway(
    issueService,
    createNotificationsModule(),
    userRepository,
    new LabEventService(
      new LabEventRepository(),
      userRepository,
    ),
    new LaboratoryScheduleService(
      new LaboratoryScheduleRepository(),
      userRepository,
    ),
    new LabResponsibilityService(
      new LabResponsibilityRepository(),
      userRepository,
    ),
    new UserScheduleService(
      new UserScheduleRepository(),
      userRepository,
    ),
  )
}
