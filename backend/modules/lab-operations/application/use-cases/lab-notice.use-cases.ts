import { assertUserCanCreateLabNotice, NotFoundError, normalizeLabNoticeNote } from "@/backend/domain"
import type { LabDirectory } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"
import type { LabNoticeRepository } from "@/backend/modules/lab-operations/application/ports/lab-notice.repository"
import { assertLabEntryAccessFor } from "@/backend/modules/lab-operations/application/use-cases/lab-event.use-cases"

/**
 * OND8-B3 — use cases de lab notices (R1). Congelados do gateway legado (golden 8.1):
 * criação exige usuário ATIVO + note não-vazia; delete segue a mesma escada de acesso dos
 * eventos (QUIRK-8L9) com as mensagens "este aviso"/"avisos deste perfil". Persistência em
 * `history` (QUIRK-8L1) é do adapter.
 */

export class ListLabNoticesUseCase {
  constructor(private readonly labNotices: LabNoticeRepository) {}

  async execute() {
    return await this.labNotices.findAllNotices()
  }
}

export class CreateLabNoticeUseCase {
  constructor(
    private readonly labNotices: LabNoticeRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { userId: number; userName: string; note: string }) {
    const user = await this.directory.findUserById(command.userId)
    assertUserCanCreateLabNotice(user)

    const note = normalizeLabNoticeNote(command.note)
    return await this.labNotices.createNotice({
      performedBy: command.userId,
      description: note,
      metadata: { userName: command.userName },
    })
  }
}

export class DeleteLabNoticeUseCase {
  constructor(
    private readonly labNotices: LabNoticeRepository,
    private readonly directory: LabDirectory,
  ) {}

  async execute(command: { noticeId: number; actorUserId: number; actorRoles: string[] }): Promise<void> {
    const notice = await this.labNotices.findNoticeById(command.noticeId)
    if (!notice) throw new NotFoundError("Aviso não encontrado")

    await assertLabEntryAccessFor(this.directory, command.actorUserId, command.actorRoles, notice.userId, "remover", "aviso")

    await this.labNotices.deleteNotice(command.noticeId)
  }
}
