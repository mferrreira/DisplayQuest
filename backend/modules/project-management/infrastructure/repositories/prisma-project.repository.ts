import { prisma } from "@/lib/database/prisma"
import type { ProjectMemberSummary } from "@/backend/domain"
import type { NewProjectInput, ProjectRecord, ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * OND5-B2 (R1) — thin `projects` adapter. The join mirrors ProjectRepository's observable
 * JSON exactly (members with user {id,name,email,roles} + memberCount from _count.members;
 * createdAt serialized as ISO — a Date's JSON form is its toISOString()). No rules here.
 */
const includeOptions = {
  members: {
    include: {
      user: {
        select: { id: true, name: true, email: true, roles: true },
      },
    },
  },
  _count: {
    select: { members: true },
  },
} as const

type ProjectRow = {
  id: number
  name: string
  description: string | null
  createdAt: Date | string
  createdBy: number
  leaderId: number | null
  status: string
  links: unknown
  startDate: string | null
  endDate: string | null
  editalNumber: string | null
  processNumber: string | null
  proppiNumber: string | null
  logoKey: string | null
  bannerKey: string | null
  members?: Array<{ userId: number; roles?: string[]; user?: { id: number; name: string; email: string; roles: string[] } | null }>
  _count?: { members?: number }
}

function toRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    createdBy: row.createdBy,
    leaderId: row.leaderId ?? null,
    status: row.status,
    links: row.links ? row.links : null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    editalNumber: row.editalNumber ?? null,
    processNumber: row.processNumber ?? null,
    proppiNumber: row.proppiNumber ?? null,
    logoKey: row.logoKey ?? null,
    bannerKey: row.bannerKey ?? null,
    memberCount: row._count?.members ?? row.members?.length ?? undefined,
    members: Array.isArray(row.members)
      ? row.members.map(
          (member): ProjectMemberSummary => ({
            userId: member.userId,
            roles: member.roles ?? [],
            user: member.user ?? null,
          }),
        )
      : undefined,
  }
}

export function createPrismaProjectRepository(): ProjectRepositoryPort {
  return {
    async findAll() {
      const rows = await prisma.projects.findMany({ include: includeOptions, orderBy: { createdAt: "desc" } })
      return rows.map((row) => toRecord(row as unknown as ProjectRow))
    },
    async findByLeaderId(leaderId) {
      const rows = await prisma.projects.findMany({
        where: { leaderId },
        include: includeOptions,
        orderBy: { createdAt: "desc" },
      })
      return rows.map((row) => toRecord(row as unknown as ProjectRow))
    },
    async findById(id) {
      const row = await prisma.projects.findUnique({ where: { id }, include: includeOptions })
      return row ? toRecord(row as unknown as ProjectRow) : null
    },
    async create(input: NewProjectInput) {
      const row = await prisma.projects.create({
        data: {
          name: input.name,
          description: input.description,
          createdAt: input.createdAt,
          createdBy: input.createdBy,
          leaderId: input.leaderId,
          status: input.status as never,
          links: input.links as never,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          editalNumber: input.editalNumber ?? null,
          processNumber: input.processNumber ?? null,
          proppiNumber: input.proppiNumber ?? null,
        },
        include: includeOptions,
      })
      return toRecord(row as unknown as ProjectRow)
    },
    async createWithCronograma(input, cronograma) {
      // Filhos aninhados: o Prisma executa pai + filhos numa transação, que é exatamente a
      // garantia da regra 9 do plano (rollback completo se qualquer linha do cronograma falhar).
      const row = await prisma.projects.create({
        data: {
          name: input.name,
          description: input.description,
          createdAt: input.createdAt,
          createdBy: input.createdBy,
          leaderId: input.leaderId,
          status: input.status as never,
          links: input.links as never,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          editalNumber: input.editalNumber ?? null,
          processNumber: input.processNumber ?? null,
          proppiNumber: input.proppiNumber ?? null,
          goals: { create: cronograma.goals },
          activities: { create: cronograma.activities },
        },
        include: {
          ...includeOptions,
          goals: { select: { id: true } },
          activities: { select: { id: true } },
        },
      })

      const created = row as unknown as ProjectRow & {
        goals?: Array<{ id: number }>
        activities?: Array<{ id: number }>
      }
      return {
        project: toRecord(created),
        goalIds: (created.goals ?? []).map((goal) => goal.id),
        activityIds: (created.activities ?? []).map((activity) => activity.id),
      }
    },
    async update(record: ProjectRecord) {
      if (!record.id) {
        throw new Error("ID do projeto é obrigatório para atualização")
      }
      const row = await prisma.projects.update({
        where: { id: record.id },
        data: {
          name: record.name,
          description: record.description ?? null,
          leaderId: record.leaderId ?? null,
          status: record.status as never,
          links: record.links as never,
          // O record vem do findById + applyProjectUpdate, então traz os valores atuais:
          // escrever `?? null` aqui não apaga o que o corpo da requisição não mencionou.
          startDate: record.startDate ?? null,
          endDate: record.endDate ?? null,
          editalNumber: record.editalNumber ?? null,
          processNumber: record.processNumber ?? null,
          proppiNumber: record.proppiNumber ?? null,
          // V5-2d: mesma postura — o record vem do findById, então escrever `?? null` mantém a
          // chave existente quando a requisição não fala de imagem. Quem TROCA a imagem é o use
          // case de imagem, que monta o record com a chave nova.
          logoKey: record.logoKey ?? null,
          bannerKey: record.bannerKey ?? null,
        },
        include: includeOptions,
      })
      return toRecord(row as unknown as ProjectRow)
    },
    // V8-1 (DEC-215): `incrementPoints` (DEC-63/74) saiu junto da coluna `projects.points` —
    // a escrita congelada com piso 0 não tem mais o que escrever.
    async delete(id) {
      await prisma.projects.delete({ where: { id } })
    },
  }
}
