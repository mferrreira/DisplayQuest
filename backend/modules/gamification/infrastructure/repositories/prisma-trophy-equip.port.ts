import { trophyEquipAudit } from "@/backend/domain/gamification"
import type { TrophyEquipPort, TrophyEquipWrite, TrophyEquipWriteResult } from "@/backend/modules/gamification/application/ports/trophy-equip.port"
import { prisma } from "@/lib/database/prisma"

/**
 * PrismaTrophyEquipPort — plan-v8 V8-6 (DEC-218/217). Equipar/desequipar um troféu conquistado.
 *
 * Uma transação, três leituras/escritas na ordem:
 *   1. a linha de conquista (`user_badges` pela unique `(userId, badgeId)`) — sem ela não há o que
 *      equipar, e o estado devolvido é `not-earned`;
 *   2. a contagem dos equipados FEITA DENTRO da transação, sobre a MESMA snapshot da escrita — é ela
 *      que é a trava do slot, não o `count` que o use case le antes: duas pessoas-cliques
 *      concorrentes num elo de um slot não podem equipar duas;
 *   3. a coluna `equipped` e a linha de auditoria, juntas. Não existe estado em que o troféu está
 *      equipado e o livro não diz.
 *
 * `unchanged` não escreve nada: equipar o que já está equipado não é um evento, e o livro-caixa
 * registra o que aconteceu. É também o que faz o botão da UI ser idempotente.
 *
 * A linha não declara trilha: `POINTS | COINS | XP` são trilhas de SALDO (`tracks.ts`), e troféu é
 * `user_badges` — a coluna fica com o default POINTS, igual à linha do troféu de CAMPEÃO (V8-4).
 * `performedBy` é a própria pessoa (DEC-218: só ela equipar), o que assina a linha e, pela FK
 * RESTRICT de `history.performedBy`, torna a pessoa não-deletável enquanto a linha existir — a
 * mesma consequência medida de DEC-55 para as linhas assinadas pela gestão.
 */
export function createPrismaTrophyEquipPort(): TrophyEquipPort {
  return {
    async applyEquip({ userId, badgeId, action, slots, elo, description }: TrophyEquipWrite): Promise<TrophyEquipWriteResult> {
      return await prisma.$transaction(async (tx) => {
        const earned = await tx.user_badges.findUnique({
          where: { userId_badgeId: { userId, badgeId } },
          select: { id: true, equipped: true },
        })

        if (!earned) {
          return { status: "not-earned", equippedBefore: 0, equippedAfter: 0 }
        }

        const equippedBefore = await tx.user_badges.count({ where: { userId, equipped: true } })

        if (action === "equip") {
          if (earned.equipped) {
            return { status: "unchanged", equippedBefore, equippedAfter: equippedBefore }
          }
          if (equippedBefore >= slots) {
            return { status: "slot-full", equippedBefore, equippedAfter: equippedBefore }
          }
        } else if (!earned.equipped) {
          return { status: "unchanged", equippedBefore, equippedAfter: equippedBefore }
        }

        await tx.user_badges.update({
          where: { id: earned.id },
          data: { equipped: action === "equip" },
        })

        const equippedAfter = action === "equip" ? equippedBefore + 1 : equippedBefore - 1
        const audit = { ...trophyEquipAudit(action, badgeId, equippedBefore, equippedAfter), elo, slots }
        // O estado nos dois lados da linha, como a linha de ajuste de trilha faz com o saldo
        // (`oldValues: { balance }` / `newValues: { balance, action, amount }`): quem lê a linha vê o
        // antes e o depois sem reconstruir o histórico inteiro.
        const state = { equipped: action === "equip" }

        await tx.history.create({
          data: {
            entityType: "USER",
            entityId: userId,
            action: action === "equip" ? "TROPHY_EQUIP" : "TROPHY_UNEQUIP",
            performedBy: userId,
            description,
            oldValues: { equipped: earned.equipped },
            newValues: { ...state, ...audit },
            metadata: audit,
          },
        })

        return { status: "applied", equippedBefore, equippedAfter }
      })
    },
  }
}
