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
  requireIssueAssigner,
  requireIssueManager,
  resolveIssueListFilter,
  ValidationError,
  type ActorRef,
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
 *
 * B6-6 (D4): o gate das 4 rotas /api/issues/* desceu para os use cases de mutacao na ordem
 * medida (lookup 404 -> gate 403 -> validacao de corpo). A regra e `requireIssueManager`
 * (MANAGE_USERS OU reporter OU assignee) e `requireIssueAssigner` (MANAGE_USERS OU reporter —
 * assignee NAO reatribui, medido). As mensagens 403 congeladas por rota chegam por parametro
 * `deniedMessage` (default = a do golden): "Sem permissão para atualizar issue" (PUT),
 * "Sem permissão para excluir issue" (DELETE), "Sem permissão para atribuir issue" (assign),
 * "Sem permissão para atualizar status do issue" (status), "Sem permissão para resolver issue"
 * (resolve — a MESMA resolcao chega por duas rotas com mensagens diferentes).
 * GET/list/create seguem sem gate de acesso (leitura aberta; create e do proprio reporter).
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

  async execute(command: { actor: ActorRef; issueId: number; data: Record<string, unknown> }) {
    const current = await this.issues.findById(command.issueId)
    if (!current) throw new NotFoundError("Issue não encontrado")

    requireIssueManager(command.actor, current, "Sem permissão para atualizar issue")

    const fields = computeIssueUpdateFields(command.data)
    return await this.issues.update(command.issueId, fields as never)
  }
}

export class DeleteIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(command: { actor: ActorRef; issueId: number }): Promise<void> {
    const issue = await this.issues.findById(command.issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    requireIssueManager(command.actor, issue, "Sem permissão para excluir issue")

    await this.issues.delete(command.issueId)
  }
}

export class AssignIssueUseCase {
  constructor(
    private readonly issues: IssueRepository,
    private readonly directory: LabDirectory,
    private readonly publisher: LabIssuePublisherPort,
  ) {}

  async execute(command: { actor: ActorRef; issueId: number; assigneeId?: number }) {
    const issue = await this.issues.findById(command.issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    // ordem medida na rota: gate ANTES do 400 de assigneeId ausente
    requireIssueAssigner(command.actor, issue, "Sem permissão para atribuir issue")

    if (!command.assigneeId) throw new ValidationError("assigneeId é obrigatório")

    const assignee = await this.directory.findUserById(command.assigneeId)
    if (!assignee) throw new NotFoundError("Usuário não encontrado")

    const patch = computeAssignPatch(command.assigneeId)
    const updated = await this.issues.update(command.issueId, patch)
    await this.notifyIssueAssigned(updated, command.assigneeId)
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

  async execute(command: { actor: ActorRef; issueId: number; deniedMessage?: string }) {
    const issue = await this.issues.findById(command.issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    requireIssueManager(command.actor, issue, command.deniedMessage ?? "Sem permissão para atualizar status do issue")

    return await this.issues.update(command.issueId, computeUnassignPatch())
  }
}

export class StartIssueProgressUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(command: { actor: ActorRef; issueId: number; deniedMessage?: string }) {
    const issue = await this.issues.findById(command.issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    requireIssueManager(command.actor, issue, command.deniedMessage ?? "Sem permissão para atualizar status do issue")

    assertCanStartProgress(issue.status)
    return await this.issues.update(command.issueId, { status: "in_progress" })
  }
}

export class ResolveIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(command: { actor: ActorRef; issueId: number; resolution?: string; deniedMessage?: string }) {
    const issue = await this.issues.findById(command.issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    // a MESMA resolcao chega por duas rotas com mensagens diferentes (medido):
    // status -> "Sem permissão para atualizar status do issue"; resolve -> "Sem permissão para resolver issue"
    requireIssueManager(command.actor, issue, command.deniedMessage ?? "Sem permissão para atualizar status do issue")

    const patch = computeResolvePatch(issue.status, command.resolution, new Date())
    return await this.issues.update(command.issueId, patch)
  }
}

export class CloseIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(command: { actor: ActorRef; issueId: number; deniedMessage?: string }) {
    const issue = await this.issues.findById(command.issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    requireIssueManager(command.actor, issue, command.deniedMessage ?? "Sem permissão para atualizar status do issue")

    assertNotClosed(issue.status)
    return await this.issues.update(command.issueId, computeClosePatch())
  }
}

export class ReopenIssueUseCase {
  constructor(private readonly issues: IssueRepository) {}

  async execute(command: { actor: ActorRef; issueId: number; deniedMessage?: string }) {
    const issue = await this.issues.findById(command.issueId)
    if (!issue) throw new NotFoundError("Issue não encontrado")

    requireIssueManager(command.actor, issue, command.deniedMessage ?? "Sem permissão para atualizar status do issue")

    assertCanReopen(issue.status)
    return await this.issues.update(command.issueId, computeReopenPatch())
  }
}
