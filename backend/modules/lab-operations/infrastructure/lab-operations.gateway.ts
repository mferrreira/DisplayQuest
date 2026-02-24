import type { NotificationsModule } from "@/backend/modules/notifications"
import type { IdentityAccessModule } from "@/backend/modules/identity-access"
import { Issue } from "@/backend/models/Issue"
import { LabEvent } from "@/backend/models/LabEvent"
import { LaboratorySchedule } from "@/backend/models/LaboratorySchedule"
import { LabResponsibility } from "@/backend/models/LabResponsibility"
import { UserSchedule } from "@/backend/models/UserSchedule"
import { IssueRepository } from "@/backend/repositories/IssueRepository"
import { LabEventRepository } from "@/backend/repositories/LabEventRepository"
import { LaboratoryScheduleRepository } from "@/backend/repositories/LaboratoryScheduleRepository"
import { LabResponsibilityRepository } from "@/backend/repositories/LabResponsibilityRepository"
import { UserScheduleRepository } from "@/backend/repositories/UserScheduleRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
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
    private readonly issueRepository: IssueRepository,
    private readonly notificationsModule: NotificationsModule,
    private readonly identityAccess: IdentityAccessModule,
    private readonly userRepository: UserRepository,
    private readonly labEventRepository: LabEventRepository,
    private readonly laboratoryScheduleRepository: LaboratoryScheduleRepository,
    private readonly labResponsibilityRepository: LabResponsibilityRepository,
    private readonly userScheduleRepository: UserScheduleRepository,
  ) {}

  async listIssues(query?: LabIssueQuery) {
    if (!query || Object.values(query).every((value) => value === undefined || value === null || value === "")) {
      return await this.issueRepository.findAll()
    }

    if (query.status) return await this.issueRepository.findByStatus(query.status as any)
    if (query.priority) return await this.issueRepository.findByPriority(query.priority as any)
    if (query.category) return await this.issueRepository.findByCategory(query.category)
    if (query.reporterId) return await this.issueRepository.findByReporter(query.reporterId)
    if (query.assigneeId) return await this.issueRepository.findByAssignee(query.assigneeId)

    if (query.search) {
      const term = query.search.trim().toLowerCase()
      const issues = await this.issueRepository.findAll()
      return issues.filter((issue) =>
        issue.title.toLowerCase().includes(term)
        || issue.description.toLowerCase().includes(term)
        || (issue.category || "").toLowerCase().includes(term),
      )
    }

    return await this.issueRepository.findAll()
  }

  async getIssue(issueId: number) {
    return await this.issueRepository.findById(issueId)
  }

  async createIssue(command: Record<string, unknown>) {
    const title = String(command.title || "").trim()
    const description = String(command.description || "").trim()
    const reporterId = Number(command.reporterId)
    const assigneeId = command.assigneeId !== undefined && command.assigneeId !== null
      ? Number(command.assigneeId)
      : null
    const category = command.category ? String(command.category) : null
    const priority = command.priority ? String(command.priority) : "medium"

    if (!title) throw new Error("Título do issue é obrigatório")
    if (!description) throw new Error("Descrição do issue é obrigatória")
    if (!Number.isInteger(reporterId) || reporterId <= 0) throw new Error("Reporter do issue é obrigatório")

    const validPriorities = ["low", "medium", "high", "urgent"]
    if (!validPriorities.includes(priority)) {
      throw new Error("Prioridade inválida")
    }

    const issue = Issue.create({
      title,
      description,
      priority: priority as any,
      category,
      reporterId,
      assigneeId,
      status: "in_progress" as any,
    })

    const created = await this.issueRepository.create(issue)
    await this.notifyIssueRaised(created)
    return created
  }

  async updateIssue(issueId: number, command: Record<string, unknown>) {
    const currentIssue = await this.issueRepository.findById(issueId)
    if (!currentIssue) throw new Error("Issue não encontrado")

    if (command.title !== undefined) {
      const title = String(command.title || "").trim()
      if (!title) throw new Error("Título do issue é obrigatório")
      currentIssue.title = title
    }
    if (command.description !== undefined) {
      const description = String(command.description || "").trim()
      if (!description) throw new Error("Descrição do issue é obrigatória")
      currentIssue.description = description
    }
    if (command.priority !== undefined) currentIssue.priority = String(command.priority) as any
    if (command.category !== undefined) currentIssue.category = command.category ? String(command.category) : null
    currentIssue.updatedAt = new Date()

    return await this.issueRepository.update(currentIssue)
  }

  async deleteIssue(issueId: number) {
    const issue = await this.issueRepository.findById(issueId)
    if (!issue) throw new Error("Issue não encontrado")
    await this.issueRepository.delete(issueId)
  }

  async assignIssue(issueId: number, assigneeId: number) {
    const issue = await this.issueRepository.findById(issueId)
    if (!issue) throw new Error("Issue não encontrado")

    const assignee = await this.userRepository.findById(assigneeId)
    if (!assignee) throw new Error("Usuário não encontrado")

    issue.assigneeId = assigneeId
    issue.status = "in_progress"
    issue.updatedAt = new Date()
    const updated = await this.issueRepository.update(issue)
    await this.notifyIssueAssigned(updated, assigneeId)
    return updated
  }

  async unassignIssue(issueId: number) {
    const issue = await this.issueRepository.findById(issueId)
    if (!issue) throw new Error("Issue não encontrado")
    issue.assigneeId = null
    issue.status = "open"
    issue.updatedAt = new Date()
    return await this.issueRepository.update(issue)
  }

  async startIssueProgress(issueId: number) {
    const issue = await this.issueRepository.findById(issueId)
    if (!issue) throw new Error("Issue não encontrado")
    if (issue.status !== "open") {
      throw new Error("Apenas issues abertos podem ser iniciados")
    }
    issue.status = "in_progress"
    issue.updatedAt = new Date()
    return await this.issueRepository.update(issue)
  }

  async resolveIssue(issueId: number, resolution?: string) {
    const issue = await this.issueRepository.findById(issueId)
    if (!issue) throw new Error("Issue não encontrado")

    if (issue.status === "closed") throw new Error("Issue já está fechado")
    if (resolution && !resolution.trim()) throw new Error("Descrição da resolução é obrigatória")
    issue.status = "resolved"
    issue.resolvedAt = new Date()
    issue.updatedAt = new Date()

    return await this.issueRepository.update(issue)
  }

  async closeIssue(issueId: number) {
    const issue = await this.issueRepository.findById(issueId)
    if (!issue) throw new Error("Issue não encontrado")

    if (issue.status === "closed") throw new Error("Issue já está fechado")
    issue.status = "closed"
    issue.updatedAt = new Date()
    return await this.issueRepository.update(issue)
  }

  async reopenIssue(issueId: number) {
    const issue = await this.issueRepository.findById(issueId)
    if (!issue) throw new Error("Issue não encontrado")

    if (issue.status !== "closed") throw new Error("Apenas issues fechados podem ser reabertos")
    issue.status = "open"
    issue.resolvedAt = null
    issue.updatedAt = new Date()
    return await this.issueRepository.update(issue)
  }

  async listLabEventsByDate(date: Date) {
    return await this.labEventRepository.findByDate(date)
  }

  async createLabEvent(command: CreateLabEventCommand) {
    const user = await this.userRepository.findById(command.userId)
    if (!user) throw new Error("Usuário não encontrado")
    if (user.status !== "active") throw new Error("Usuário não tem permissão para criar eventos")

    const event = LabEvent.create(command)
    return await this.labEventRepository.create(event)
  }

  async listLaboratorySchedules() {
    return await this.laboratoryScheduleRepository.findAll()
  }

  async createLaboratorySchedule(command: CreateLaboratoryScheduleCommand) {
    const canManage = await this.canUserManageLaboratorySchedule(command.userId)
    if (!canManage) {
      throw new Error("Usuário não tem permissão para gerenciar horários do laboratório")
    }

    const schedule = LaboratorySchedule.create({
      dayOfWeek: command.dayOfWeek,
      startTime: command.startTime,
      endTime: command.endTime,
      notes: command.notes || null,
    })

    return await this.laboratoryScheduleRepository.create(schedule)
  }

  async updateLaboratorySchedule(scheduleId: number, command: UpdateLaboratoryScheduleCommand) {
    const existing = await this.laboratoryScheduleRepository.findById(scheduleId)
    if (!existing) throw new Error("Horário do laboratório não encontrado")

    const canManage = await this.canUserManageLaboratorySchedule(command.userId)
    if (!canManage) {
      throw new Error("Usuário não tem permissão para gerenciar horários do laboratório")
    }

    if (command.startTime !== undefined || command.endTime !== undefined || command.notes !== undefined) {
      existing.startTime = command.startTime || existing.startTime
      existing.endTime = command.endTime || existing.endTime
      existing.notes = command.notes || undefined
      existing.updatedAt = new Date()
    }

    return await this.laboratoryScheduleRepository.update(existing)
  }

  async deleteLaboratorySchedule(scheduleId: number) {
    const existing = await this.laboratoryScheduleRepository.findById(scheduleId)
    if (!existing) throw new Error("Horário do laboratório não encontrado")
    await this.laboratoryScheduleRepository.delete(scheduleId)
  }

  async listResponsibilities(query?: ListResponsibilitiesQuery) {
    if (query?.activeOnly) {
      return { activeResponsibility: await this.labResponsibilityRepository.findActiveResponsibility() }
    }

    if (query?.startDate && query?.endDate) {
      return {
        responsibilities: await this.labResponsibilityRepository.findByDateRange(query.startDate, query.endDate),
      }
    }

    return { responsibilities: await this.labResponsibilityRepository.findAll() }
  }

  async startResponsibility(command: StartResponsibilityCommand) {
    const user = await this.userRepository.findById(command.actorUserId)
    if (!user) throw new Error("Usuário não encontrado")

    const canStart = this.identityAccess.hasAnyRole(user.roles, ["COORDENADOR", "GERENTE"])
    if (!canStart) {
      throw new Error("Usuário não tem permissão para iniciar responsabilidades")
    }

    const active = await this.labResponsibilityRepository.findActiveResponsibility()
    if (active) {
      throw new Error("Já existe uma responsabilidade ativa. Finalize a responsabilidade atual antes de iniciar uma nova.")
    }

    const responsibility = LabResponsibility.create({
      userId: command.actorUserId,
      userName: command.actorName,
      startTime: new Date(),
      endTime: null,
      notes: command.notes || null,
    })

    return await this.labResponsibilityRepository.create(responsibility)
  }

  async canEndResponsibility(actorUserId: number, responsibilityId: number) {
    const user = await this.userRepository.findById(actorUserId)
    if (!user) return false

    const responsibility = await this.labResponsibilityRepository.findById(responsibilityId)
    if (!responsibility) return false

    if (responsibility.userId === actorUserId) return true
    return this.identityAccess.hasAnyRole(user.roles, ["COORDENADOR", "GERENTE", "LABORATORISTA"])
  }

  async endResponsibility(responsibilityId: number, notes?: string) {
    const existing = await this.labResponsibilityRepository.findById(responsibilityId)
    if (!existing) throw new Error("Responsabilidade não encontrada")
    if (existing.endTime) throw new Error("Responsabilidade já foi finalizada")
    existing.endTime = new Date()
    existing.notes = notes || existing.notes
    existing.updatedAt = new Date()
    return await this.labResponsibilityRepository.update(existing)
  }

  async updateResponsibilityNotes(responsibilityId: number, actorUserId: number, notes: string) {
    const existing = await this.labResponsibilityRepository.findById(responsibilityId)
    if (!existing) throw new Error("Responsabilidade não encontrada")

    const canEnd = await this.canEndResponsibility(actorUserId, responsibilityId)
    if (!canEnd) throw new Error("Acesso negado")

    existing.notes = notes.trim() || null
    existing.updatedAt = new Date()
    return await this.labResponsibilityRepository.update(existing)
  }

  async deleteResponsibility(responsibilityId: number) {
    const existing = await this.labResponsibilityRepository.findById(responsibilityId)
    if (!existing) throw new Error("Responsabilidade não encontrada")
    await this.labResponsibilityRepository.delete(responsibilityId)
  }

  async listUserSchedules(query: ListUserSchedulesQuery) {
    const canManageSchedules = hasPermission(query.actorRoles, "MANAGE_USERS")

    if (query.targetUserId) {
      if (!canManageSchedules && query.targetUserId !== query.actorUserId) {
        throw new Error("Acesso negado")
      }
      return await this.userScheduleRepository.findByUserId(query.targetUserId)
    }

    if (canManageSchedules) {
      return await this.userScheduleRepository.findAll()
    }

    return await this.userScheduleRepository.findByUserId(query.actorUserId)
  }

  async getUserSchedule(scheduleId: number) {
    return await this.userScheduleRepository.findById(scheduleId)
  }

  async createUserSchedule(command: CreateUserScheduleCommand) {
    const canManageSchedules = hasPermission(command.actorRoles, "MANAGE_USERS")
    if (!canManageSchedules && command.targetUserId !== command.actorUserId) {
      throw new Error("Acesso negado")
    }

    const user = await this.userRepository.findById(command.targetUserId)
    if (!user) throw new Error("Usuário não encontrado")

    const schedule = UserSchedule.create({
      userId: command.targetUserId,
      dayOfWeek: command.dayOfWeek,
      startTime: command.startTime,
      endTime: command.endTime,
    })

    return await this.userScheduleRepository.create(schedule)
  }

  async updateUserSchedule(command: UpdateUserScheduleCommand) {
    const existing = await this.userScheduleRepository.findById(command.scheduleId)
    if (!existing) throw new Error("Horário não encontrado")

    const canManageSchedules = hasPermission(command.actorRoles, "MANAGE_USERS")
    if (!canManageSchedules && existing.userId !== command.actorUserId) {
      throw new Error("Acesso negado")
    }

    if (command.startTime !== undefined || command.endTime !== undefined) {
      existing.startTime = command.startTime || existing.startTime
      existing.endTime = command.endTime || existing.endTime
    }

    return await this.userScheduleRepository.update(existing)
  }

  async deleteUserSchedule(command: DeleteUserScheduleCommand) {
    const existing = await this.userScheduleRepository.findById(command.scheduleId)
    if (!existing) throw new Error("Horário não encontrado")

    const canManageSchedules = hasPermission(command.actorRoles, "MANAGE_USERS")
    if (!canManageSchedules && existing.userId !== command.actorUserId) {
      throw new Error("Acesso negado")
    }

    await this.userScheduleRepository.delete(command.scheduleId)
  }

  private async canUserManageLaboratorySchedule(userId?: number) {
    if (!userId || !Number.isInteger(userId)) return false

    const user = await this.userRepository.findById(userId)
    if (!user) return false

    return this.identityAccess.hasAnyRole(user.roles, ["COORDENADOR", "GERENTE", "LABORATORISTA"])
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

export interface LabOperationsGatewayDependencies {
  issueRepository: IssueRepository
  notificationsModule: NotificationsModule
  identityAccess: IdentityAccessModule
  userRepository: UserRepository
  labEventRepository: LabEventRepository
  laboratoryScheduleRepository: LaboratoryScheduleRepository
  labResponsibilityRepository: LabResponsibilityRepository
  userScheduleRepository: UserScheduleRepository
}

export function createLabOperationsGateway(
  dependencies: Partial<LabOperationsGatewayDependencies> = {},
) {
  if (!dependencies.notificationsModule || !dependencies.identityAccess) {
    throw new Error("LabOperationsGateway requer notificationsModule e identityAccess")
  }

  return new DefaultLabOperationsGateway(
    dependencies.issueRepository ?? new IssueRepository(),
    dependencies.notificationsModule,
    dependencies.identityAccess,
    dependencies.userRepository ?? new UserRepository(),
    dependencies.labEventRepository ?? new LabEventRepository(),
    dependencies.laboratoryScheduleRepository ?? new LaboratoryScheduleRepository(),
    dependencies.labResponsibilityRepository ?? new LabResponsibilityRepository(),
    dependencies.userScheduleRepository ?? new UserScheduleRepository(),
  )
}
