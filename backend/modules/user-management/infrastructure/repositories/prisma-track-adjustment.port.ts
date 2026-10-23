import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import {
  COINS_GAMIFICATION_TRACK,
  applyTrackAdjustment,
  trackAdjustmentDescription,
} from "@/backend/domain";
import type {
  TrackAdjustmentLedgerPort,
  TrackAdjustmentResult,
} from "@/backend/modules/user-management/application/ports/track-adjustment-ledger.port";

/**
 * PrismaTrackAdjustmentLedger — plan-v8 V8-5 (ASK-V8-24). O ajuste manual do painel escreve o
 * saldo da trilha e a linha de auditoria no MESMO $transaction, espelhando o adaptador de award
 * (users.update + history.create juntos). A aritmética é a regra pura do domínio, aplicada sobre
 * o saldo lido DENTRO da transação: o número que cai na coluna e o que a linha de auditoria
 * reporta são o mesmo número, e dois cliques concorrentes não gravam um saldo fantasma.
 *
 * A linha declara a trilha na coluna `track` e é de outra família do award: `action`
 * TRACK_ADJUSTMENT. As rotinas de idempotência de premiação (`hasAward`, revisão semanal de XP)
 * leem `GAMIFICATION_AWARD` por descrição, e a varredura diária do feed de tarefa apaga só
 * `entityType: "task"` — nenhuma das duas alcança um ajuste, que é `entityType: "USER"`.
 */
export function createPrismaTrackAdjustmentLedger(): TrackAdjustmentLedgerPort {
  return {
    async adjust({ userId, actorId, track, action, amount }): Promise<TrackAdjustmentResult> {
      const isCoins = track === COINS_GAMIFICATION_TRACK;

      return await prisma.$transaction(async (tx) => {
        const user = await tx.users.findUnique({
          where: { id: userId },
          select: { points: true, coins: true },
        });
        if (!user) return { applied: false, reason: "usuario-ausente" };

        const balanceBefore = isCoins ? user.coins : user.points;
        const balanceAfter = applyTrackAdjustment(track, action, amount, balanceBefore);

        await tx.users.update({
          where: { id: userId },
          data: isCoins ? { coins: balanceAfter } : { points: balanceAfter },
        });

        await tx.history.create({
          data: {
            entityType: "USER",
            entityId: userId,
            action: "TRACK_ADJUSTMENT",
            performedBy: actorId,
            description: trackAdjustmentDescription(track, action, amount),
            track,
            oldValues: { balance: balanceBefore },
            newValues: { balance: balanceAfter, action, amount },
            metadata: { domain: "user-management", track, action, actorId },
          },
        });

        return { applied: true, track, balanceBefore, balanceAfter };
      });
    },
  };
}
