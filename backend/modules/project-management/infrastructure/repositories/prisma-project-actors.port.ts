import { prisma } from "@/lib/database/prisma"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"

/**
 * OND5-B2 (R1) — thin user read the manage decision needs. This is the query
 * ProjectServiceGateway used to run inline against `prisma` (rg06 debt inside the module, now
 * behind a port). V5-2a (DEC-127) removeu as duas leituras da regra de acesso antiga
 * (`membershipExists`, `findProjectRelation`): a leitura não consulta tabela.
 */
export function createPrismaProjectActorsPort(): ProjectActorsPort {
  return {
    async findActor(userId) {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true, roles: true },
      })
      return user ? { id: user.id, roles: (user.roles ?? []) as unknown as string[] } : null
    },
  }
}
