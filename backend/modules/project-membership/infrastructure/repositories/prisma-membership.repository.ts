import { prisma } from "@/lib/database/prisma"
import { civilDayOfInstant } from "@/backend/domain"
import type { MemberCategory, MemberSituation, Role } from "@/backend/domain"
import type {
  MembershipDetailRecord,
  MembershipProfileFields,
  MembershipRecord,
  MembershipSummary,
  ProjectMembershipRepositoryPort,
} from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * OND5-B2 (R1) — thin `project_members` adapter for the membership module. Query shapes
 * mirror the legacy gateway 1:1 (joinedAt DESC list, projectId_userId unique lookup,
 * roles-has count); no business rules live here.
 *
 * V5-4b: os cinco campos do vínculo entram no select. A regra de normalização não mora aqui —
 * o adapter escreve o que o use case já normalizou (RG-02).
 */
const userSelect = { id: true, name: true, email: true } as const

/** As colunas do vínculo, lidas juntas: é a lista que as mostra e o perfil que as escreve. */
const memberProfileSelect = {
  lattes: true,
  cargaHoraria: true,
  categoria: true,
  situacao: true,
  dataEntrada: true,
} as const

type MemberRow = {
  id: number
  projectId: number
  userId: number
  roles: Role[]
  joinedAt: Date
  lattes: string | null
  cargaHoraria: number | null
  categoria: string | null
  situacao: string
  dataEntrada: string | null
  user?: { id: number; name: string; email: string } | null
}

function toProfile(row: MemberRow): MembershipProfileFields {
  return {
    lattes: row.lattes,
    cargaHoraria: row.cargaHoraria,
    // O banco é `String?`: o token que chega aqui foi escrito pela regra pura, e o record
    // devolve o tipo do domínio sem revalidar (a validação é da escrita, não da leitura).
    categoria: (row.categoria as MemberCategory | null) ?? null,
    situacao: (row.situacao as MemberSituation) ?? "ATIVO",
    dataEntrada: row.dataEntrada,
  }
}

function toRecord(row: MemberRow): MembershipRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    roles: row.roles ?? [],
    joinedAt: row.joinedAt,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
    ...toProfile(row),
  }
}

export function createPrismaMembershipRepository(): ProjectMembershipRepositoryPort {
  return {
    async listMembersWithUser(projectId) {
      const rows = await prisma.project_members.findMany({
        where: { projectId },
        include: { user: { select: userSelect } },
        orderBy: { joinedAt: "desc" },
      })
      return rows.map((row) => toRecord(row as MemberRow))
    },
    async findMembership(projectId, userId) {
      const row = await prisma.project_members.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { id: true, roles: true },
      })
      return row ? { id: row.id, roles: (row.roles ?? []) as Role[] } satisfies MembershipSummary : null
    },
    async findMembershipById(membershipId, projectId) {
      const row = await prisma.project_members.findFirst({
        where: { id: membershipId, projectId },
        include: { user: { select: { name: true } } },
      })
      if (!row) return null
      return {
        id: row.id,
        userId: row.userId,
        roles: (row.roles ?? []) as Role[],
        userName: row.user?.name ?? null,
        ...toProfile(row as unknown as MemberRow),
      } satisfies MembershipDetailRecord
    },
    async countMembersWithRole(projectId, role) {
      return prisma.project_members.count({
        where: { projectId, roles: { has: role } },
      })
    },
    async createMembership(input) {
      const row = await prisma.project_members.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          roles: input.roles,
          // V5-4b: o vínculo novo entra HOJE no calendário. `joinedAt` é o instantâneo em que a
          // linha nasceu; `dataEntrada` é o dia civil que o documento usa. Quem entra retroativo
          // corrige o campo pela tela.
          dataEntrada: civilDayOfInstant(new Date()),
        },
        include: { user: { select: userSelect } },
      })
      return toRecord(row as MemberRow)
    },
    async updateMembershipRoles(membershipId, roles) {
      const row = await prisma.project_members.update({
        where: { id: membershipId },
        data: { roles },
        include: { user: { select: userSelect } },
      })
      return toRecord(row as MemberRow)
    },
    async updateMembershipProfile(membershipId, data) {
      const row = await prisma.project_members.update({
        where: { id: membershipId },
        // O use case já mergeou sobre o que estava gravado, então escrever os cinco campos é
        // reescrever os não tocados com o próprio valor deles.
        data: {
          lattes: data.lattes,
          cargaHoraria: data.cargaHoraria,
          categoria: data.categoria,
          situacao: data.situacao,
          dataEntrada: data.dataEntrada,
        },
        include: { user: { select: userSelect } },
      })
      return toRecord(row as MemberRow)
    },
    async deleteMembership(membershipId) {
      await prisma.project_members.delete({ where: { id: membershipId } })
    },
  }
}
