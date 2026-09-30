import {
  assertCanReopen,
  assertCanStartProgress,
  assertNotClosed,
  computeAssignPatch,
  computeClosePatch,
  computeIssueUpdateFields,
  computeReopenPatch,
  computeResolvePatch,
  computeUnassignPatch,
  matchesIssueSearch,
  NotFoundError,
  normalizeIssueCreate,
  resolveIssueListFilter,
} from "@/backend/domain"
import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { LabIssuePublisherPort } from "@/backend/modules/lab-operations/application/ports/lab-issue-publisher.port"
import type { IssueRepository } from "@/backend/modules/lab-operations/application/ports/issue.repository"

/**
 * OND8-B3 — use cases de issues (R1). Congelados do DefaultLabOperationsGateway legado
 * (golden 8.1): filtros mutuamente exclusivos (QUIRK-8L3), status forçado open no create
 * (8L2), assign/unassign forçando status (8L6/8L7), resolution descartada (8L5), notificação
 * LAB_ISSUE_RAISED p/ LAB+COORD+GERENTE ativos exceto reporter com falha engolida via
 * console.error (8L8).
 */

const ISSUE_NOTIFY_ROLES = ["LABORATORISTA", "COORDENADOR", "GERENTE"]

export class ListIssuesUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(query?: {
    status?: string
    priority?: string
    category?: string
    reporterId?: number
    assigneeId?: number
    search?: string
  }) {
    const filter = resolveIssueListFilter(query)
    switch (filter.by) {
      case "status":
        return await this.issues.findByStatus(filter.value)
      case "priority":
        return await this.issues.findByPriority(filter.value)
      case "category":
        return await this.issues.findByCategory(filter.value)
      case "reporterId":
        return await this.issues.findByReporterId(filter.value)
      case "assigneeId":
        return await this.issues.findByAssigneeId(filter.value)
      case "search": {
        const all = await this.issues.findAll()
        return all.filter((issue) => matchesIssueSearch(issue, filter.term))
      }
      default:
        return await this.issues.findAll()
    }
  }
}

export class GetIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number) {
    return await this.issues.findById(issueId)
  }
}

export class CreateIssueUseCase {
  constructor(
    private readonly issues: IssueRepository,
    private readonly directory: LabDirectory,
    private readonly publisher: LabIssuePublisherPort,
  ) {}

  async execute(command: Record<string, unknown>) {
    const input = normalizeIssueCreate(command)
    const created = await this.issues.create(input)
    await this.notifyIssueRaised(created)
    return created
  }

  private async notifyIssueRaised(issue: Awaited<ReturnType<IssueRepository["create"]>>): Promise<void> {
    try {
      const candidates = await this.directory.findUsersWithRoles(ISSUE_NOTIFY_ROLES)
      const recipients = candidates
        .filter((user) => user.id && user.status === "active" && user.id !== issue.reporterId)
        .map((user) => user.id)

      if (recipients.length === 0) return

      await this.publisher.publishIssueRaised({
        issueId: issue.id,
        title: issue.title,
        priority: issue.priority,
        reporterId: issue.reporterId,
        recipientIds: recipients,
      })
    } catch (error) {
      console.error("Erro ao publicar notificação de issue reportada:", error)
    }
  }
}

export class UpdateIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number, command: Record<string, unknown>) {
    const current = await this.issues.findById(issueId)
    if (!current) throw new NotFoundError("Issue não encontrado")

    const fields = computeIssueUpdateFields(command)
    return await this.issues.update(issueId, fields as never)
  }
}

export class DeleteIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number): Promise<void> {
    const issue = await this.issues.findById(issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")
    await this.issues.delete(issueId)
  }
}

export class AssignIssueUseCase {
  constructor(
    private readonly issues: IssueRepository,
    private readonly directory: LabDirectory,
    private readonly publisher: LabIssuePublisherPort,
  ) {}

  async execute(issueId: number, assigneeId: number) {
    const issue = await this.issues.findById(issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    const assignee = await this.directory.findUserById(assigneeId)
    if (!assignee) throw new NotFoundError("Usuário não encontrado")

    const patch = computeAssignPatch(assigneeId)
    const updated = await this.issues.update(issueId, patch)
    await this.notifyIssueAssigned(updated, assigneeId)
    return updated
  }

  private async notifyIssueAssigned(issue: Awaited<ReturnType<IssueRepository["update"]>>, assigneeId: number): Promise<void> {
    try {
      await this.publisher.publishIssueAssigned({
        issueId: issue.id,
        title: issue.title,
        priority: issue.priority,
        assigneeId,
      })
    } catch (error) {
      console.error("Erro ao publicar notificação de issue atribuída:", error)
    }
  }
}

export class UnassignIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number) {
    const issue = await this.issues.findById(issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")
    return await this.issues.update(issueId, computeUnassignPatch())
  }
}

export class StartIssueProgressUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number) {
    const issue = await this.issues.findById(issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")
    assertCanStartProgress(issue.status)
    return await this.issues.update(issueId, { status: "in_progress" })
  }
}

export class ResolveIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number, resolution?: string) {
    const issue = await this.issues.findById(issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    const patch = computeResolvePatch(issue.status, resolution, new Date())
    return await this.issues.update(issueId, patch)
  }
}

export class CloseIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number) {
    const issue = await this.issues.findById(issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")
    assertNotClosed(issue.status)
    return await this.issues.update(issueId, computeClosePatch())
  }
}

export class ReopenIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(issueId: number) {
    const issue = await this.issues.findById(issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")
    assertCanReopen(issue.status)
    return await this.issues.update(issueId, computeReopenPatch())
  }
}
