import { prisma } from "@/lib/database/prisma"
import { LabNotice } from "@/backend/models/LabNotice"

const LAB_NOTICE_ENTITY = "LAB_NOTICE"

export class LabNoticeRepository {
  async findAll(): Promise<LabNotice[]> {
    const notices = await prisma.history.findMany({
      where: {
        entityType: LAB_NOTICE_ENTITY,
        action: "CREATE",
      },
      orderBy: { performedAt: "desc" },
    })

    return notices.map((notice) => LabNotice.fromPrisma(notice))
  }

  async findById(id: number): Promise<LabNotice | null> {
    const notice = await prisma.history.findFirst({
      where: {
        id,
        entityType: LAB_NOTICE_ENTITY,
        action: "CREATE",
      },
    })

    return notice ? LabNotice.fromPrisma(notice) : null
  }

  async create(notice: LabNotice): Promise<LabNotice> {
    const created = await prisma.history.create({
      data: {
        entityType: LAB_NOTICE_ENTITY,
        entityId: 0,
        action: "CREATE",
        performedBy: notice.userId,
        description: notice.note,
        metadata: {
          userName: notice.userName,
        },
      },
    })

    return LabNotice.fromPrisma(created)
  }

  async delete(id: number): Promise<void> {
    await prisma.history.delete({
      where: { id },
    })
  }
}
