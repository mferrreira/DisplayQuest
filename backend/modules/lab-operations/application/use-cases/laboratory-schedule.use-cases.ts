import { ForbiddenError, isLabManagerRole, mergeLaboratoryScheduleUpdate, NotFoundError, validateScheduleFields } from "@/backend/domain"
import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { LaboratoryScheduleRepository } from "@/backend/modules/lab-operations/application/ports/laboratory-schedule.repository"

/**
 * OND8-B3 — use cases de laboratory schedules (R1). Congelados do gateway legado
 * (golden 8.1): permissão por papel ANTES da validação; update ignora dayOfWeek e nunca
 * limpa notes (QUIRK-8L12); delete exige papel após o existence-check.
 */

const PERMISSION_MESSAGE = "Usuário não tem permissão para gerenciar horários do laboratório"

async function canManageLaboratorySchedule(directory: LabDirectory, userId?: number): Promise<boolean> {
  if (!userId || !Number.isInteger(userId)) return false
  const user = await directory.findUserById(userId)
  if (!user) return false
  return isLabManagerRole(user.roles)
}

export class ListLaboratorySchedulesUseCase {
  constructor(private readonly schedules: LaboratoryScheduleRepository) {}

  async execute() {
    return await this.schedules.findAll()
  }
}

export class CreateLaboratoryScheduleUseCase {
  constructor(
    private readonly schedules: LaboratoryScheduleRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { dayOfWeek: number; startTime: string; endTime: string; notes?: string; userId?: number }) {
    if (!(await canManageLaboratorySchedule(this.directory, command.userId))) {
      throw new ForbiddenError(PERMISSION_MESSAGE)
    }

    validateScheduleFields({ dayOfWeek: command.dayOfWeek, startTime: command.startTime, endTime: command.endTime })
    return await this.schedules.create({
      dayOfWeek: command.dayOfWeek,
      startTime: command.startTime,
      endTime: command.endTime,
      notes: command.notes,
    })
  }
}

export class UpdateLaboratoryScheduleUseCase {
  constructor(
    private readonly schedules: LaboratoryScheduleRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(
    scheduleId: number,
    command: { dayOfWeek?: number; startTime?: string; endTime?: string; notes?: string; userId?: number },
  ) {
    const existing = await this.schedules.findById(scheduleId)
    if (!existing) throw new NotFoundError("Horário do laboratório não encontrado")

    if (!(await canManageLaboratorySchedule(this.directory, command.userId))) {
      throw new ForbiddenError(PERMISSION_MESSAGE)
    }

    const merge = mergeLaboratoryScheduleUpdate(existing, command)
    // Validacao do repositorio legado (LaboratoryScheduleRepository.update) sobre o modelo
    // MESCLADO: dayOfWeek sempre o existente (update nao o toca), startTime/endTime mesclados.
    validateScheduleFields({ dayOfWeek: existing.dayOfWeek, startTime: merge.startTime ?? existing.startTime, endTime: merge.endTime ?? existing.endTime })
    return await this.schedules.update(
      scheduleId,
      merge.changed ? { startTime: merge.startTime, endTime: merge.endTime, notes: merge.notes } : {},
    )
  }
}

export class DeleteLaboratoryScheduleUseCase {
  constructor(
    private readonly schedules: LaboratoryScheduleRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { scheduleId: number; userId?: number }): Promise<void> {
    const existing = await this.schedules.findById(command.scheduleId)
    if (!existing) throw new NotFoundError("Horário do laboratório não encontrado")

    if (!(await canManageLaboratorySchedule(this.directory, command.userId))) {
      throw new ForbiddenError(PERMISSION_MESSAGE)
    }

    await this.schedules.delete(command.scheduleId)
  }
}
