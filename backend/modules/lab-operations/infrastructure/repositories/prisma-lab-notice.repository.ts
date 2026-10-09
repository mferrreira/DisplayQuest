import { prisma } from "@/lib/database/prisma"
import { LabNotice } from "@/backend/models/LabNotice"
import type { LabNoticeRepository } from "@/backend/modules/lab-operations/application/ports/lab-notice.repository"

/**
 * OND8-B3 — adapter de lab notices (R2). QUIRK-8L1 preservado: aviso mora na tabela
 * `history` (entityType LAB_NOTICE / action CREATE / entityId 0 / metadata.userName) —
 * exatamente como o LabNoticeRepository legado. A porta esconde isso dos use cases.
 */

const LAB_NOTICE_ENTITY = "LAB_NOTICE"

export class PrismaLabNoticeRepository implements LabNoticeRepository {
  async findAllNotices(): Promise<LabNotice[]> {
    const rows = await prisma.history.findMany({
      where: { entityType: LAB_NOTICE_ENTITY, action: "CREATE" },
      orderBy: { performedAt: "desc" },
    })
    return rows.map(LabNotice.fromPrisma)
  }

  async findNoticeById(id: number): Promise<LabNotice | null> {
    const row = await prisma.history.findFirst({
      where: { id, entityType: LAB_NOTICE_ENTITY, action: "CREATE" },
    })
    return row ? LabNotice.fromPrisma(row) : null
  }

  async createNotice(input: {
    performedBy: number
    description: string
    metadata: { userName: string }
  }): Promise<LabNotice> {
    const created = await prisma.history.create({
      data: {
        entityType: LAB_NOTICE_ENTITY,
        entityId: 0,
        action: "CREATE",
        performedBy: input.performedBy,
        description: input.description,
        metadata: input.metadata,
      },
    })
    return LabNotice.fromPrisma(created)
  }

  async deleteNotice(id: number): Promise<void> {
    await prisma.history.delete({ where: { id } })
  }
}
