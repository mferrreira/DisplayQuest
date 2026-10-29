import { prisma } from "@/lib/database/prisma";
import type { ProfileVisibilityPort } from "@/backend/modules/user-management/application/ports/profile-visibility.port";

/**
 * PrismaProfileVisibility — vínculo em comum lido de `project_members` (V5-12, DEC-143/177).
 *
 * Duas leituras: os projetos do ator, depois as pessoas desses projetos. `distinct` na
 * segunda evita devolver uma cópia por projeto compartilhado. O próprio é excluído — a
 * regra trata self antes de qualquer vínculo.
 */
export class PrismaProfileVisibility implements ProfileVisibilityPort {
  async findSharedProjectUserIds(actorId: number): Promise<number[]> {
    const mine = await prisma.project_members.findMany({
      where: { userId: actorId },
      select: { projectId: true },
    });
    if (mine.length === 0) return [];

    const rows = await prisma.project_members.findMany({
      where: { projectId: { in: mine.map((row) => row.projectId) }, userId: { not: actorId } },
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.map((row) => row.userId);
  }
}

export function createPrismaProfileVisibility(): ProfileVisibilityPort {
  return new PrismaProfileVisibility();
}
