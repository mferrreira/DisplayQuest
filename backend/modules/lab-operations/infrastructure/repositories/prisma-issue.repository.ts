import { prisma } from "@/lib/database/prisma"
import { Issue } from "@/backend/models/Issue"
import type { NormalizedIssueCreate } from "@/backend/domain"
import type { IssueRepository } from "@/backend/modules/lab-operations/application/ports/issue.repository"

/**
 * OND8-B3 — adapter Prisma fino de `issues` (R2). orderBy createdAt desc congelado do
 * legado; records construídos com Issue.fromPrisma (classe pura, sem I/O) para manter o
 * toJSON EXATO que as rotas consomem (batch 0.4). include reporter/assignee do legado é
 * ignorado pelo modelo — omitido aqui (mesmo output medido no golden 8.1).
 */

const ORDER = { createdAt: "desc" as const }

export class PrismaIssueRepository implements IssueRepository {
  async findById(id: number): Promise<Issue | null> {
    const row = await prisma.issues.findUnique({ where: { id } })
    return row ? Issue.fromPrisma(row) : null
  }

  async findAll(): Promise<Issue[]> {
    const rows = await prisma.issues.findMany({ orderBy: ORDER })
    return rows.map(Issue.fromPrisma)
  }

  async findByStatus(status: string): Promise<Issue[]> {
    const rows = await prisma.issues.findMany({ where: { status: status as never }, orderBy: ORDER })
    return rows.map(Issue.fromPrisma)
  }

  async findByPriority(priority: string): Promise<Issue[]> {
    const rows = await prisma.issues.findMany({ where: { priority: priority as never }, orderBy: ORDER })
    return rows.map(Issue.fromPrisma)
  }

  async findByCategory(category: string): Promise<Issue[]> {
    const rows = await prisma.issues.findMany({ where: { category }, orderBy: ORDER })
    return rows.map(Issue.fromPrisma)
  }

  async findByReporterId(reporterId: number): Promise<Issue[]> {
    const rows = await prisma.issues.findMany({ where: { reporterId }, orderBy: ORDER })
    return rows.map(Issue.fromPrisma)
  }

  async findByAssigneeId(assigneeId: number): Promise<Issue[]> {
    const rows = await prisma.issues.findMany({ where: { assigneeId }, orderBy: ORDER })
    return rows.map(Issue.fromPrisma)
  }

  async create(input: NormalizedIssueCreate): Promise<Issue> {
    const created = await prisma.issues.create({ data: input as never })
    return Issue.fromPrisma(created)
  }

  async update(id: number, fields: Partial<NormalizedIssueCreate>): Promise<Issue> {
    const updated = await prisma.issues.update({ where: { id }, data: fields as never })
    return Issue.fromPrisma(updated)
  }

  async delete(id: number): Promise<void> {
    await prisma.issues.delete({ where: { id } })
  }
}
