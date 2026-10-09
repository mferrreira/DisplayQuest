import {
  assertCanStartResponsibility,
  assertNoActiveResponsibility,
  computeEndPatch,
  computeNotesPatch,
  computePausePatch,
  computeResumePatch,
  decideCanEndResponsibility,
  ForbiddenError,
  LAB_MANAGER_ROLES,
  NotFoundError,
  requireActorAnyRole,
  validateResponsibilityCreate,
  type ActorRef,
} from "@/backend/domain"
import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { ResponsibilityRepository } from "@/backend/modules/lab-operations/application/ports/responsibility.repository"

/**
 * OND8-B3 — use cases de responsabilidades (R1). Congelados do gateway legado (golden 8.1):
 * ativa GLOBAL (QUIRK-8L10); end/delete sem checagem de acesso no nível de gateway
 * (QUIRK-8L11 — as rotas checam via canEndResponsibility); notes falsy preserva;
 * pause no-op silencioso; resume dobra o trecho (totalPausedMs).
 *
 * B6-6 (D4): os gates das rotas desceram para os use cases, na ordem medida:
 *  - start: `requireActorAnyRole` [COORDENADOR, GERENTE, LABORATORISTA] com a mensagem congelada
 *    da rota ("Sem permissão para iniciar responsabilidade do laboratório") ANTES da busca do
 *    usuario; `assertCanStartResponsibility` (roles do BANCO) continua como segunda linha —
 *    sessao e banco podem divergir, e o golden que nega VOLUNTARIO segue valendo.
 *  - end/updateNotes: a checagem `canEndResponsibility` (decidida pela rota legado) passou para
 *    dentro dos use cases ANTES do lookup — preserva o quirk medido: responsabilidade ausente
 *    responde 403 (canEnd false), nao 404. As mensagens 403 congeladas por rota viraram as dos
 *    use cases ("Apenas o laboratorista atual ou um administrador pode encerrar a
 *    responsabilidade" / "Sem permissão para atualizar notas desta responsabilidade" — o
 *    "Acesso negado" interno do updateNotes era inalcançavel pela rota e saiu).
 *  - delete: `requireActorAnyRole` com "Sem permissão para excluir responsabilidade" antes do
 *    lookup (ordem medida).
 *  - pause/resume: self-only na rota; o cron chama para OUTRO usuario (rotina sem pessoa).
 *    O comando passou a carregar ator + userId: pessoa so opera a propria (guarda de wiring,
 *    mensagem nao e contrato), system passa (DEC-54 — SCHEDULED_PAUSE).
 */

export class ListResponsibilitiesUseCase {
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(query?: { activeOnly?: boolean; startDate?: Date; endDate?: Date }) {
    if (query?.activeOnly) {
      return { activeResponsibility: await this.responsibilities.findActive() }
    }

    if (query?.startDate && query?.endDate) {
      return { responsibilities: await this.responsibilities.findByDateRange(query.startDate, query.endDate) }
    }

    return { responsibilities: await this.responsibilities.findAll() }
  }
}

/** Guarda de wiring (B6-6): start/delete/end tem pessoa atras — nenhuma rotina de sistema os
 * chama; um systemActor aqui e erro de wiring, e a mensagem nao e contrato congelado. */
function requirePersonActor(actor: ActorRef, message = "Ação de responsabilidade exige ator pessoa"): number {
  if (actor.kind !== "user") throw new ForbiddenError(message)
  return actor.id
}

export class StartResponsibilityUseCase {
  constructor(
    private readonly responsibilities: ResponsibilityRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { actor: ActorRef; actorName: string; notes?: string }) {
    requireActorAnyRole(
      command.actor,
      LAB_MANAGER_ROLES,
      "Sem permissão para iniciar responsabilidade do laboratório",
    )
    const actorUserId = requirePersonActor(command.actor)

    const user = await this.directory.findUserById(actorUserId)
    assertCanStartResponsibility(user)

    const active = await this.responsibilities.findActive()
    assertNoActiveResponsibility(active)

    const startTime = new Date()
    validateResponsibilityCreate({ userId: actorUserId, userName: command.actorName, startTime })

    return await this.responsibilities.create({
      userId: actorUserId,
      userName: command.actorName,
      startTime,
      endTime: null,
      pausedAt: null,
      totalPausedMs: 0,
      notes: command.notes || null,
    })
  }
}

export class CanEndResponsibilityUseCase {
  constructor(
    private readonly responsibilities: ResponsibilityRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(actorUserId: number, responsibilityId: number): Promise<boolean> {
    const actor = await this.directory.findUserById(actorUserId)
    if (!actor) return false

    const responsibility = await this.responsibilities.findById(responsibilityId)
    return decideCanEndResponsibility({ actor, responsibility, actorUserId })
  }
}

export class EndResponsibilityUseCase {
  constructor(
    private readonly responsibilities: ResponsibilityRepository,
    private readonly canEndResponsibility: CanEndResponsibilityUseCase,
  ) {}

  async execute(command: { actor: ActorRef; responsibilityId: number; notes?: string }) {
    const actorUserId = requirePersonActor(command.actor)

    // ordem medida na rota: canEnd ANTES do lookup — responsabilidade ausente responde 403
    // (canEnd false para null), nao 404 (quirk congelado pelo characterization B6-0).
    const canEnd = await this.canEndResponsibility.execute(actorUserId, command.responsibilityId)
    if (!canEnd) {
      throw new ForbiddenError(
        "Apenas o laboratorista atual ou um administrador pode encerrar a responsabilidade",
      )
    }

    const existing = await this.responsibilities.findById(command.responsibilityId)
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada")

    const patch = computeEndPatch(existing, command.notes, new Date())
    return await this.responsibilities.update(command.responsibilityId, patch)
  }
}

export class PauseResponsibilityUseCase {
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(command: { actor: ActorRef; userId: number }) {
    // self-only para pessoa (a rota so passa o proprio id); system opera para o userId da
    // varredura (DEC-54). Guarda de wiring: mensagem nao e contrato.
    if (command.actor.kind === "user" && command.actor.id !== command.userId) {
      throw new ForbiddenError("Acesso negado")
    }

    const active = await this.responsibilities.findActiveForUser(command.userId)
    if (!active) return null

    const patch = computePausePatch(active, new Date())
    if (!patch) return active // QUIRK-8L15: no-op silencioso quando já pausada

    return await this.responsibilities.update(active.id as number, { pausedAt: patch.pausedAt })
  }
}

export class ResumeResponsibilityUseCase {
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(command: { actor: ActorRef; userId: number }) {
    if (command.actor.kind === "user" && command.actor.id !== command.userId) {
      throw new ForbiddenError("Acesso negado")
    }

    const responsibility = await this.responsibilities.findPausedForUser(command.userId)
    if (!responsibility) return null

    const patch = computeResumePatch(responsibility, new Date())
    if (!patch) return null

    return await this.responsibilities.update(responsibility.id as number, patch)
  }
}

export class UpdateResponsibilityNotesUseCase {
  constructor(
    private readonly responsibilities: ResponsibilityRepository,
    private readonly canEndResponsibility: CanEndResponsibilityUseCase,
  ) {}

  async execute(command: { actor: ActorRef; responsibilityId: number; notes: string }) {
    const actorUserId = requirePersonActor(command.actor)

    // canEnd antes do lookup (ordem medida na rota; ausente -> 403, nao 404). A mensagem
    // congelada da rota virou a do use case; o "Acesso negado" interno era inalcançavel.
    const canEnd = await this.canEndResponsibility.execute(actorUserId, command.responsibilityId)
    if (!canEnd) {
      throw new ForbiddenError("Sem permissão para atualizar notas desta responsabilidade")
    }

    const existing = await this.responsibilities.findById(command.responsibilityId)
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada")

    return await this.responsibilities.update(command.responsibilityId, computeNotesPatch(command.notes))
  }
}

export class DeleteResponsibilityUseCase {
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(command: { actor: ActorRef; responsibilityId: number }): Promise<void> {
    requireActorAnyRole(command.actor, LAB_MANAGER_ROLES, "Sem permissão para excluir responsabilidade")
    requirePersonActor(command.actor)

    const existing = await this.responsibilities.findById(command.responsibilityId)
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada")
    await this.responsibilities.delete(command.responsibilityId)
  }
}
