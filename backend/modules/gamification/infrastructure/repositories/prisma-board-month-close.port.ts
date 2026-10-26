import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/database/prisma"
import { ConflictError } from "@/backend/domain/errors"
import { toUserStatus } from "@/backend/domain/identity"
import { monthAlreadyClosedMessage } from "@/backend/domain/gamification"
import type { BoardMonthClosePort, MonthCloseWrite } from "@/backend/modules/gamification/application/ports/board-month-close.port"

/**
 * PrismaBoardMonthClosePort — plan-v9 S02 (ADR-002, ADR-003, DEC-225, DEC-226).
 *
 * Duas tabelas, um `$transaction` só. A linha da pessoa e o zerado do placar dela acontecem no
 * mesmo commit, e o registro de mês entra na mesma transação: se qualquer uma das três escritas
 * falha, nada aconteceu (INV5 do MODELO — "não existe meio mês fechado").
 *
 * Idempotência por duas constraints medidas no banco:
 *  - `board_month_closes (month, track)`: o mês está fechado, e a run nem chega aqui;
 *  - `month_history (userId, month, track)`: uma linha por pessoa e mês.
 * Se duas runs concorrentes passam pela checagem juntas, a segunda bate em P2002 aqui dentro e vira
 * `ConflictError` nomeando o mês — 409 no HTTP, não 500 legado.
 */
export function createPrismaBoardMonthClosePort(): BoardMonthClosePort {
  return {
    async findClosedMonth(month, track) {
      const header = await prisma.board_month_closes.findUnique({
        where: { month_track: { month, track } },
        select: { month: true, closedAt: true },
      })
      return header ? { month: header.month, closedAt: header.closedAt } : null
    },

    async listPeopleForClose() {
      // Toda pessoa da base, com o status reconciliado pelo vocabulario do dominio (DEC-125): a
      // audiencia de linha e decidida pela regra, e o zerado alcanga toda pessoa (R11).
      const rows = await prisma.users.findMany({
        select: { id: true, name: true, status: true, currentMonthPoints: true },
        orderBy: { id: "asc" },
      })
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: toUserStatus(row.status),
        currentMonthPoints: row.currentMonthPoints,
      }))
    },

    async writeClose(input: MonthCloseWrite) {
      try {
        await prisma.$transaction(async (tx) => {
          const header = await tx.board_month_closes.create({
            data: {
              month: input.month,
              track: input.track,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              closedAt: input.closedAt,
              triggeredBy: input.triggeredBy,
              peopleCount: input.rows.length,
            },
            select: { id: true },
          })

          for (const row of input.rows) {
            await tx.month_history.create({
              data: {
                closeId: header.id,
                userId: row.userId,
                userName: row.userName,
                month: row.month,
                track: row.track,
                value: row.value,
                position: row.position,
                periodStart: row.periodStart,
                periodEnd: row.periodEnd,
                closedAt: row.closedAt,
              },
            })
          }

          if (input.userIdsToZero.length > 0) {
            await tx.users.updateMany({
              where: { id: { in: input.userIdsToZero } },
              data: { currentMonthPoints: 0 },
            })
          }
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictError(monthAlreadyClosedMessage(input.month))
        }
        throw error
      }
    },
  }
}
