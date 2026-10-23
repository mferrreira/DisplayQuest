import {
  TROPHY_EQUIP_DENIED_MESSAGE,
  TROPHY_NOT_EARNED_MESSAGE,
  parseTrophyEquipAction,
  requireActorSelf,
  trophyEquipDescription,
  trophySlotMessage,
  type ActorRef,
} from "@/backend/domain"
import { ConflictError, NotFoundError, ValidationError } from "@/backend/domain/errors/DomainError"
import type { TrophyEquipPort } from "@/backend/modules/gamification/application/ports/trophy-equip.port"
import type { ChangeTrophyEquipCommand, TrophyEquipOutcome } from "@/backend/modules/gamification/application/contracts"
import type { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"

/**
 * ChangeTrophyEquipUseCase — plan-v8 V8-6 (DEC-217/218). Equipar ou desequipar um troféu conquistado.
 *
 * O que este arquivo decide, e o motivo:
 *
 * 1. **Autoridade é a pessoa, sozinha.** MODELO §6: "a pessoa EQUIPA". A gestão (`MANAGE_USERS`)
 *    concede e remove troféu (o caminho admin existente) — equipar não entra nesse pacote, e o
 *    `requireActorSelf` não tem bypass de sistema: nenhuma rotina equipar troféu de ninguém, e uma
 *    porta sem chamador é o tipo de porta que a DEC-54 teve que fechar. Quem não é a pessoa ouve
 *    `TROPHY_EQUIP_DENIED_MESSAGE` (403) — antes de qualquer leitura de troféu, para não confirmar
 *    que a conquista existe (mesma disciplina do `subtasks: []` da DEC-189).
 * 2. **O slot é o do elo DO MOMENTO** (DEC-217): o teto vem da escada lida do XP da temporada, não
 *    da coluna `users.elo` nem do elo que a pessoa tinha quando conquistou. Subiu a OURO em março,
 *    equipou 2 a partir de março; a virada zera o XP e o teto volta a zero junto. O lookup é o
 *    `GetUserProgressionUseCase` sem ator — mesmo motivo do `read-user-progression`: quem concede o
 *    direito não é quem decide o teto.
 * 3. **A recusa do slot é 409 com a frase da escada** (`trophySlotMessage`), uma família só para
 *    "elo sem slot" e "slot cheio". 400 seria "o pedido está mal formado" — e ele não está: a pessoa
 *    tem o troféu e quer equipar; o que falta é degrau.
 * 4. **Não recalcula nada.** Este use case escreve `user_badges.equipped` e a linha de auditoria.
 *    Nenhum caminho daqui toca `history` de prêmio, `users.points`, `users.coins` ou `users.xp`: o
 *    boost é lido no instantâneo do credit seguinte (MODELO §6), e é por isso que equipar hoje não
 *    muda o número de ontem.
 * 5. **Troféu não conquistado é 404** — o precedente medido é o `RemoveUserBadgeUseCase`
 *    ("Usuário não possui este badge"). Não existe "equipar um troféu que a pessoa não tem".
 * 6. **Redundância não é erro e não escreve linha**: equipar o equipado devolve o estado atual com
 *    `unchanged: true`. O livro-caixa registra o que aconteceu, e a UI pode martelar o botão.
 *
 * A ordem é a da casa: ator → entrada → slot → escrita. O precedentes medidos são os dois lados do
 * mesmo problema: `UpdateBadgeUseCase` valida o id no use case DEPOIS do gate (B6-2a — quem não tem
 * permissão não recebe 400 de id inválido), e `PATCH /api/users/[id]/points` valida a AÇÃO antes do
 * número (DEC-60 — a regra do valor depende da ação). Aqui o gate precisa do id da PESSOA (é sobre
 * ele que "self" decide), e a entrada do TROFÉU é validada depois do gate: `badgeId` e `action`
 * entram crus e viram tipo aqui, com as frases congeladas.
 *
 * Os tetos e a contagem são conferidos DENTRO da transação pelo adaptador (a corrida de dois
 * cliques), e o `status` devolvido pela port é o que vira erro aqui — port devolve fato, use case
 * decide.
 */
export interface ChangeTrophyEquipDependencies {
  progression: GetUserProgressionUseCase
  equip: TrophyEquipPort
}

export class ChangeTrophyEquipUseCase {
  constructor(private readonly dependencies: ChangeTrophyEquipDependencies) {}

  async execute(command: ChangeTrophyEquipCommand): Promise<TrophyEquipOutcome> {
    requireActorSelf(command.actor, command.userId, TROPHY_EQUIP_DENIED_MESSAGE)

    const action = parseTrophyEquipAction(command.action)
    const badgeId = requireTrophyBadgeId(command.badgeId)

    const progression = await this.dependencies.progression.execute(command.userId)

    const result = await this.dependencies.equip.applyEquip({
      userId: command.userId,
      badgeId,
      action,
      slots: progression.trophySlots,
      elo: progression.elo,
      description: trophyEquipDescription(action, command.userId, badgeId),
    })

    if (result.status === "not-earned") {
      throw new NotFoundError(TROPHY_NOT_EARNED_MESSAGE)
    }

    if (result.status === "slot-full") {
      throw new ConflictError(trophySlotMessage(progression.elo))
    }

    return {
      userId: command.userId,
      badgeId,
      action,
      elo: progression.elo,
      slots: progression.trophySlots,
      equippedBefore: result.equippedBefore,
      equippedAfter: result.equippedAfter,
      unchanged: result.status === "unchanged",
    }
  }
}

/** MESMA frase do CRUD de troféu (`requireBadgeId` em `badge-management.use-cases.ts`): um id só tem
 * um jeito de ser inválido, e duas frases seriam duas regras. */
function requireTrophyBadgeId(id: unknown): number {
  if (!Number.isInteger(id) || (id as number) <= 0) {
    throw new ValidationError("Badge inválido")
  }
  return id as number
}
