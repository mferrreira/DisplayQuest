import {
  mergeUserScheduleUpdate,
  NotFoundError,
  requireActorPermission,
  validateUserScheduleSlot,
  type ActorRef,
} from "@/backend/domain"
import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { UserScheduleRepository } from "@/backend/modules/lab-operations/application/ports/user-schedule.repository"

/**
 * OND8-B3 — use cases de grades de usuário (R1). Congelados do gateway legado (golden 8.1):
 * leitura ABERTA (QUIRK-8L14); escrita exige MANAGE_USERS; updateUserSchedule ignora
 * dayOfWeek (8L13); replace bypassa validação por slot (createMany cru — 8L13).
 */

// B6-6 (D4): assertManageUsers em forma tipada — a MESMA regra e a MESMA mensagem ("Acesso negado",
// default do ensurePermission legado). O gate da rota schedules/bulk era duplicado desta regra com o
// mesmo default; removido (a rota passa por AssertCanManageUserSchedulesUseCase antes do parse para
// preservar o 403-antes-dos-400 de corpo, medido).
function assertManageUsers(actor: ActorRef): void {
  requireActorPermission(actor, "MANAGE_USERS", "Acesso negado")
}

export class ListUserSchedulesUseCase {
  constructor(private readonly schedules: UserScheduleRepository) {}

  async execute(query: { targetUserId?: number }) {
    if (query.targetUserId) return await this.schedules.findByUserId(query.targetUserId)
    return await this.schedules.findAll()
  }
}

export class GetUserScheduleUseCase {
  constructor(private readonly schedules: UserScheduleRepository) {}

  async execute(scheduleId: number) {
    return await this.schedules.findById(scheduleId)
  }
}

export class CreateUserScheduleUseCase {
  constructor(
    private readonly schedules: UserScheduleRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: {
    actor: ActorRef
    targetUserId: number
    dayOfWeek: number
    startTime: string
    endTime: string
  }) {
    assertManageUsers(command.actor)

    const user = await this.directory.findUserById(command.targetUserId)
    if (!user) throw new NotFoundError("Usuário não encontrado")

    validateUserScheduleSlot({
      userId: command.targetUserId,
      dayOfWeek: command.dayOfWeek,
      startTime: command.startTime,
      endTime: command.endTime,
    })

    return await this.schedules.create({
      userId: command.targetUserId,
      dayOfWeek: command.dayOfWeek,
      startTime: command.startTime,
      endTime: command.endTime,
    })
  }
}

export class UpdateUserScheduleUseCase {
  constructor(private readonly schedules: UserScheduleRepository) {}

  async execute(command: {
    actor: ActorRef
    scheduleId: number
    dayOfWeek?: number
    startTime?: string
    endTime?: string
  }) {
    assertManageUsers(command.actor)

    const existing = await this.schedules.findById(command.scheduleId)
    if (!existing) throw new NotFoundError("Horário não encontrado")

    const merge = mergeUserScheduleUpdate(existing, command)
    // Validacao do repositorio legado (UserScheduleRepository.update) sobre o modelo MESCLADO:
    // userId/dayOfWeek do existente (dayOfWeek e ignorado no merge — 8L13 — mas validado).
    validateUserScheduleSlot({
      userId: existing.userId,
      dayOfWeek: existing.dayOfWeek,
      startTime: merge.startTime ?? existing.startTime,
      endTime: merge.endTime ?? existing.endTime,
    })
    return await this.schedules.update(command.scheduleId, merge.changed ? { startTime: merge.startTime, endTime: merge.endTime } : {})
  }
}

export class DeleteUserScheduleUseCase {
  constructor(private readonly schedules: UserScheduleRepository) {}

  async execute(command: { actor: ActorRef; scheduleId: number }): Promise<void> {
    assertManageUsers(command.actor)

    const existing = await this.schedules.findById(command.scheduleId)
    if (!existing) throw new NotFoundError("Horário não encontrado")

    await this.schedules.delete(command.scheduleId)
  }
}

export class ReplaceUserSchedulesUseCase {
  constructor(private readonly schedules: UserScheduleRepository) {}

  async execute(command: {
    actor: ActorRef
    targetUserId: number
    slots: { dayOfWeek: number; startTime: string; endTime: string }[]
  }) {
    assertManageUsers(command.actor)

    // QUIRK-8L13: replace legado NÃO valida slots (createMany escreve cru).
    return await this.schedules.replaceForUser(command.targetUserId, command.slots)
  }
}

/**
 * AssertCanManageUserSchedulesUseCase — B6-6 (D4), molde do AssertCanPublishNotificationEventUseCase
 * (B6-2b): a rota schedules/bulk autoriza ANTES de ler o corpo, porque os 400 de entrada ("JSON
 * inválido", "userId inválido", "Dados inválidos: ...") vem DEPOIS do 403 na ordem medida — sem
 * este assert antes do parse, quem não tem permissão com corpo inválido passaria a receber 400.
 * `replaceUserSchedules` recheca no próprio ator para proteger os demais chamadores.
 */
export class AssertCanManageUserSchedulesUseCase {
  execute(command: { actor: ActorRef }): void {
    assertManageUsers(command.actor)
  }
}
