import {
  assertCanStartResponsibility,
  assertNoActiveResponsibility,
  computeEndPatch,
  computeNotesPatch,
  computePausePatch,
  computeResumePatch,
  decideCanEndResponsibility,
  ForbiddenError,
  NotFoundError,
  validateResponsibilityCreate,
} from "@/backend/domain"
import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { ResponsibilityRepository } from "@/backend/modules/lab-operations/application/ports/responsibility.repository"

/**
 * OND8-B3 — use cases de responsabilidades (R1). Congelados do gateway legado (golden 8.1):
 * ativa GLOBAL (QUIRK-8L10); end/delete sem checagem de acesso no nível de gateway
 * (QUIRK-8L11 — as rotas checam via canEndResponsibility); notes falsy preserva;
 * pause no-op silencioso; resume dobra o trecho (totalPausedMs).
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

export class StartResponsibilityUseCase {
  constructor(
    private readonly responsibilities: ResponsibilityRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { actorUserId: number; actorName: string; notes?: string }) {
    const user = await this.directory.findUserById(command.actorUserId)
    assertCanStartResponsibility(user)

    const active = await this.responsibilities.findActive()
    assertNoActiveResponsibility(active)

    const startTime = new Date()
    validateResponsibilityCreate({ userId: command.actorUserId, userName: command.actorName, startTime })

    return await this.responsibilities.create({
      userId: command.actorUserId,
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
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(responsibilityId: number, notes?: string) {
    const existing = await this.responsibilities.findById(responsibilityId)
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada")

    const patch = computeEndPatch(existing, notes, new Date())
    return await this.responsibilities.update(responsibilityId, patch)
  }
}

export class PauseResponsibilityUseCase {
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(userId: number) {
    const active = await this.responsibilities.findActiveForUser(userId)
    if (!active) return null

    const patch = computePausePatch(active, new Date())
    if (!patch) return active // QUIRK-8L15: no-op silencioso quando já pausada

    return await this.responsibilities.update(active.id as number, { pausedAt: patch.pausedAt })
  }
}

export class ResumeResponsibilityUseCase {
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(userId: number) {
    const responsibility = await this.responsibilities.findPausedForUser(userId)
    if (!responsibility) return null

    const patch = computeResumePatch(responsibility, new Date())
    if (!patch) return null

    return await this.responsibilities.update(responsibility.id as number, patch)
  }
}

export class UpdateResponsibilityNotesUseCase {
  constructor(
    private readonly responsibilities: ResponsibilityRepository,
    private readonly directory: LabDirectory,
    private readonly canEndResponsibility: CanEndResponsibilityUseCase,
  ) {}

  async execute(responsibilityId: number, actorUserId: number, notes: string) {
    const existing = await this.responsibilities.findById(responsibilityId)
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada")

    const canEnd = await this.canEndResponsibility.execute(actorUserId, responsibilityId)
    if (!canEnd) throw new ForbiddenError("Acesso negado")

    return await this.responsibilities.update(responsibilityId, computeNotesPatch(notes))
  }
}

export class DeleteResponsibilityUseCase {
  constructor(private readonly responsibilities: ResponsibilityRepository) {}

  async execute(responsibilityId: number): Promise<void> {
    const existing = await this.responsibilities.findById(responsibilityId)
    if (!existing) throw new NotFoundError("Responsabilidade não encontrada")
    await this.responsibilities.delete(responsibilityId)
  }
}
