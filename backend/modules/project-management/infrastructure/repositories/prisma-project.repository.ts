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
    async findByUserId(userId) {
      const rows = await prisma.projects.findMany({
        where: { members: { some: { userId } } },
        include: includeOptions,
        orderBy: { createdAt: "desc" },
      })
      return rows.map((row) => toRecord(row as unknown as ProjectRow))
    },
    async findByCreatorId(creatorId) {
      const rows = await prisma.projects.findMany({
        where: { createdBy: creatorId },
        include: includeOptions,
        orderBy: { createdAt: "desc" },
      })
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
        },
        include: includeOptions,
      })
      return toRecord(row as unknown as ProjectRow)
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
        },
        include: includeOptions,
      })
      return toRecord(row as unknown as ProjectRow)
    },
    async delete(id) {
      await prisma.projects.delete({ where: { id } })
    },
  }
}
