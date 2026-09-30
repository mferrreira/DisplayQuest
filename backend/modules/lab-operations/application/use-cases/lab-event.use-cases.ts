import {
  assertLabEntryAccess,
  assertTargetUserExists,
  assertUserCanCreateLabEvent,
  computeLabEventUpdateFields,
  computeLocalDayWindow,
  decideLabEntryAccess,
  isLabManagerRole,
  NotFoundError,
  validateLabEventCreate,
} from "@/backend/domain"
import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { LabEntryNoun } from "@/backend/domain"
import type { LabEventRepository } from "@/backend/modules/lab-operations/application/ports/lab-event.repository"

/**
 * OND8-B3 — use cases de lab events (R1). Congelados do gateway legado (golden 8.1):
 * criação exige usuário ATIVO; acesso cross-user (QUIRK-8L9) na ordem exata do legado:
 * ator -> papel -> usuário do recurso -> prioridade ESTRITAMENTE maior; acesso ANTES da
 * validação; janelas de dia local ASC / range ASC.
 */

/** Ordem legada de assertCanManageLabEvent: ator, papel (antes do alvo!), alvo, prioridade. */
export async function assertLabEntryAccessFor(
  directory: LabDirectory,
  actorUserId: number,
  actorRoles: string[],
  targetUserId: number,
  action: "editar" | "remover",
  noun: LabEntryNoun,
): Promise<void> {
  const actor = await directory.findUserById(actorUserId)
  if (!actor) throw new NotFoundError("Usuário não encontrado")

  if (actorUserId === targetUserId) return

  if (!isLabManagerRole(actor.roles)) {
    assertLabEntryAccess({ allowed: false, reason: "no-role" }, action, noun)
    return
  }

  const targetUser = await directory.findUserById(targetUserId)
  assertTargetUserExists(targetUser, noun)

  assertLabEntryAccess(
    decideLabEntryAccess({ actorUserId, actorRoles: actor.roles, targetUserId, targetRoles: targetUser.roles }),
    action,
    noun,
  )
}

export class ListLabEventsByDateUseCase {
  constructor(private readonly labEvents: LabEventRepository) {}

  async execute(date: Date) {
    const { start, end } = computeLocalDayWindow(date)
    return await this.labEvents.findByDateRange(start, end)
  }
}

export class ListLabEventsByRangeUseCase {
  constructor(private readonly labEvents: LabEventRepository) {}

  async execute(query: { startDate: Date; endDate: Date }) {
    return await this.labEvents.findByDateRange(query.startDate, query.endDate)
  }
}

export class CreateLabEventUseCase {
  constructor(
    private readonly labEvents: LabEventRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { userId: number; userName: string; date: Date; note: string }) {
    const user = await this.directory.findUserById(command.userId)
    assertUserCanCreateLabEvent(user)

    validateLabEventCreate(command)
    return await this.labEvents.create({
      userId: command.userId,
      userName: command.userName,
      date: command.date,
      note: command.note,
    })
  }
}

export class UpdateLabEventUseCase {
  constructor(
    private readonly labEvents: LabEventRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { eventId: number; actorUserId: number; actorRoles: string[]; date?: Date; note?: string }) {
    const event = await this.labEvents.findById(command.eventId)
    if (!event) throw new NotFoundError("Evento não encontrado")

    await assertLabEntryAccessFor(this.directory, command.actorUserId, command.actorRoles, event.userId, "editar", "evento")

    const fields = computeLabEventUpdateFields(command)
    return await this.labEvents.update(command.eventId, fields)
  }
}

export class DeleteLabEventUseCase {
  constructor(
    private readonly labEvents: LabEventRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { eventId: number; actorUserId: number; actorRoles: string[] }): Promise<void> {
    const event = await this.labEvents.findById(command.eventId)
    if (!event) throw new NotFoundError("Evento não encontrado")

    await assertLabEntryAccessFor(this.directory, command.actorUserId, command.actorRoles, event.userId, "remover", "evento")

    await this.labEvents.delete(command.eventId)
  }
}
