import { prisma } from "@/lib/database/prisma"
import type {
  ActivityApprovalFields,
  ActivityRequestFields,
  NewProjectActivityInput,
  NewProjectGoalInput,
  ProjectActivityRecord,
  ProjectActivityUpdateFields,
  ProjectCronogramaPort,
  ProjectGoalRecord,
  ProjectGoalUpdateFields,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository"

/**
 * V5-5 (DEC-61/103/126) — adaptador fino de `project_goals` e `project_activities`.
 *
 * Nenhuma regra aqui: mês, período, ordem e recompensa são decididos em
 * `backend/domain/project/cronograma-rules.ts` pelos use cases (RG-04: o adapter não decide).
 * `order` é ordenado crescente porque a linha do cronograma é "Etapa 1, Etapa 2, …" — a ordem é
 * a apresentação, e o desempate por `id` deixa a lista estável entre duas leituras.
 *
 * `createdAt`/`updatedAt` saem ISO porque a coluna é `DateTime` — mesma conversão do adaptador de
 * entregáveis.
 */
type GoalRow = {
  id: number
  projectId: number
  order: number
  target: number | null
  description: string
  createdAt: Date | string
}

type ActivityRow = {
  id: number
  projectId: number
  order: number
  description: string
  responsibleId: number | null
  firstMonth: string
  lastMonth: string
  status: string
  requestedBy: number | null
  requestedAt: Date | string | null
  approvedBy: number | null
  approvedAt: Date | string | null
  overdueNotifiedAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

function stamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function optionalStamp(value: Date | string | null): string | null {
  return value === null ? null : stamp(value)
}

function toGoalRecord(row: GoalRow): ProjectGoalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    order: row.order,
    target: row.target,
    description: row.description,
    createdAt: stamp(row.createdAt),
  }
}

function toActivityRecord(row: ActivityRow): ProjectActivityRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    order: row.order,
    description: row.description,
    responsibleId: row.responsibleId,
    firstMonth: row.firstMonth,
    lastMonth: row.lastMonth,
    status: row.status,
    requestedBy: row.requestedBy,
    requestedAt: optionalStamp(row.requestedAt),
    approvedBy: row.approvedBy,
    approvedAt: optionalStamp(row.approvedAt),
    overdueNotifiedAt: optionalStamp(row.overdueNotifiedAt),
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
  }
}

export function createPrismaProjectCronogramaRepository(): ProjectCronogramaPort {
  return {
    async listGoals(projectId: number) {
      const rows = await prisma.project_goals.findMany({
        where: { projectId },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      })
      return rows.map(toGoalRecord)
    },

    async findGoalById(id: number) {
      const row = await prisma.project_goals.findUnique({ where: { id } })
      return row ? toGoalRecord(row) : null
    },

    async createGoal(input: NewProjectGoalInput) {
      const row = await prisma.project_goals.create({ data: input })
      return toGoalRecord(row)
    },

    async updateGoal(id: number, fields: ProjectGoalUpdateFields) {
      const row = await prisma.project_goals.update({ where: { id }, data: fields })
      return toGoalRecord(row)
    },

    async deleteGoal(id: number) {
      await prisma.project_goals.delete({ where: { id } })
    },

    async listActivities(projectId: number) {
      const rows = await prisma.project_activities.findMany({
        where: { projectId },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      })
      return rows.map(toActivityRecord)
    },

    async findActivityById(id: number) {
      const row = await prisma.project_activities.findUnique({ where: { id } })
      return row ? toActivityRecord(row) : null
    },

    async createActivity(input: NewProjectActivityInput) {
      const row = await prisma.project_activities.create({ data: input })
      return toActivityRecord(row)
    },

    async updateActivity(id: number, fields: ProjectActivityUpdateFields) {
      const row = await prisma.project_activities.update({ where: { id }, data: fields })
      return toActivityRecord(row)
    },

    async requestActivity(id: number, fields: ActivityRequestFields) {
      const row = await prisma.project_activities.update({ where: { id }, data: fields })
      return toActivityRecord(row)
    },

    async approveActivity(id: number, fields: ActivityApprovalFields) {
      const row = await prisma.project_activities.update({ where: { id }, data: fields })
      return toActivityRecord(row)
    },

    async deleteActivity(id: number) {
      await prisma.project_activities.delete({ where: { id } })
    },
  }
}
