import { prisma } from "@/lib/database/prisma"
import type { LabDirectory, LabUserRef } from "@/backend/modules/lab-operations/application/ports/lab-directory.port"

/**
 * OND8-B3 — directory adapter de `users` para o lab (R2). findUsersWithRoles espelha o
 * UserRepository.findWithRoles legado (roles hasSome, orderBy createdAt desc). As
 * decisões de acesso são as politicas PURAS do dominio (DEC-19: sem identity-access).
 */
export class PrismaLabDirectory implements LabDirectory {
  async findUserById(userId: number): Promise<LabUserRef | null> {
    const row = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, status: true, roles: true },
    })
    return row ? { id: row.id, status: row.status, roles: row.roles } : null
  }

  async findUsersWithRoles(roles: string[]): Promise<LabUserRef[]> {
    const rows = await prisma.users.findMany({
      where: { roles: { hasSome: roles as never } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, roles: true },
    })
    return rows.map((row) => ({ id: row.id, status: row.status, roles: row.roles }))
  }
}
