/**
 * PrismaPasswordResetRepository — adapter fino de persistência da solicitação de troca
 * de senha (plan-v24 S01). I/O + mapping only (SPEC §1.2): Prisma row <-> record.
 * Nenhuma regra de negócio vive aqui.
 */
import { prisma } from "@/lib/database/prisma"
import type { PasswordResetStatus } from "@/backend/domain"
import type {
  NewPasswordResetRecord,
  PasswordResetPort,
  PasswordResetRecord,
} from "@/backend/modules/user-management/application/ports/password-reset.port"

function toRecord(row: {
  id: number
  email: string
  password: string
  status: string
  createdAt: Date
  resolvedAt: Date | null
  resolvedBy: number | null
}): PasswordResetRecord {
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    status: row.status as PasswordResetStatus,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
  }
}

export function createPrismaPasswordResetRepository(): PasswordResetPort {
  return {
    async createPending(data: NewPasswordResetRecord) {
      const row = await prisma.password_reset_requests.create({
        data: { email: data.email, password: data.password, status: "pending" },
      })
      return toRecord(row)
    },
    async findPendingByEmail(email: string) {
      const row = await prisma.password_reset_requests.findFirst({
        where: { email, status: "pending" },
      })
      return row ? toRecord(row) : null
    },
    async findById(id: number) {
      const row = await prisma.password_reset_requests.findUnique({ where: { id } })
      return row ? toRecord(row) : null
    },
    async listPending() {
      const rows = await prisma.password_reset_requests.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
      })
      return rows.map(toRecord)
    },
    async update(record: PasswordResetRecord) {
      const row = await prisma.password_reset_requests.update({
        where: { id: record.id },
        data: {
          status: record.status,
          resolvedAt: record.resolvedAt,
          resolvedBy: record.resolvedBy,
        },
      })
      return toRecord(row)
    },
  }
}
