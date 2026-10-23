import {
  SEASON_CHAMPION_BADGE_NAME,
  closingSeasonYearOfInstant,
  isSeasonParticipant,
  rankSeasonStandings,
  seasonChampionDescription,
  seasonChampionOf,
  seasonClosingEloForXp,
} from "@/backend/domain/gamification"
import { requireActorPermission } from "@/backend/domain/identity"
import type { SeasonChampionPort } from "@/backend/modules/gamification/application/ports/season-champion.port"
import type { SeasonCyclePort } from "@/backend/modules/gamification/application/ports/season-cycle.port"
import type {
  CloseSeasonCommand,
  CloseSeasonResult,
  SeasonChampionResult,
  SeasonCloseOutcome,
} from "@/backend/modules/gamification/application/contracts"

/** Mesma frase dos outros dois ciclos: quem não é gestão não fecha temporada de ninguém. */
export const SEASON_CLOSE_DENIED_MESSAGE = "Apenas coordenadores e gerentes podem acessar."

/**
 * CloseSeasonUseCase — plan-v8 V8-4 (DEC-213). A virada da temporada anual: fotografa o ano em
 * `season_history` (pontos somados dos meses, tarefas somadas, XP da temporada, posição) e zera as
 * duas trilhas da temporada em `users`.
 *
 * O que este arquivo decide, e o motivo de cada decisão:
 *
 * 1. **Livro-caixa antes da zeragem, na mesma transação** (o port): não existe estado em que o ano
 *    está fechado e a trilha aberta. A leitura `getSeasonSnapshot` vem antes da escrita — é ela que
 *    diz "não zeramos de novo", igual ao fechamento mensal (V8-2).
 * 2. **Moeda e troféu ficam.** MODELO §4: na virada zeram pontos, XP e elo; `users.coins` e
 *    `user_badges` não são tocados. O use case não tem uma linha que escreva neles, e o roundtrip da
 *    onda congela isso lendo os dois antes e depois.
 * 3. **O campeão sai do livro lido de volta, não da memória da run.** As posições são calculadas com
 *    a régua do domínio (`rankSeasonStandings`) e escritas junto com a linha; o troféu é resolvido por
 *    `listSeasonStandings(year)` depois das escritas. É o que faz uma run repetida — ou uma run que
 *    encontrou metade das pessoas já fechadas — escolher o MESMO campeão da run original: a autoridade
 *    é o que está gravado, não o que a memória desta chamada montou.
 * 4. **Troféu sem tabela.** A chave `GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>` na linha de
 *    auditoria é a idempotência do troféu (mesma escolha da revisão semanal de XP). O badge é vitalício
 *    pela unique `(userId, badgeId)`: quem foi campeão em dois anos tem um troféu e duas linhas.
 * 5. **Elo fotografado, elo zerado.** A DEC-217 (V8-6) fechou a escada: a linha do ano agora grava o
 *    degrau do XP com que a pessoa fecha o ano (`seasonClosingEloForXp`), e o port zera a COLUNA
 *    `users.elo` junto com o XP. As duas coisas juntas são a regra: o degrau alcançado vira memória da
 *    temporada, e a temporada nova começa no primeiro degrau — sem zerar a coluna, a pessoa abriria o
 *    ano com o slot de troféu do ano encerrado. As linhas já escritas pela V8-4 ficam com `elo` nulo
 *    (o livro não se reescreve) e o outcome reporta o que a linha diz.
 *
 * O gate é o dos ciclos anteriores (`MANAGE_USERS`, com `systemActor` bypassando — DEC-54). Hoje o
 * chamador é o cron; nenhuma rota declara ator de sistema (a guarda `system-actor.test.ts` falha o
 * build se uma declarar).
 */
export class CloseSeasonUseCase {
  constructor(
    private readonly dependencies: {
      cycle: SeasonCyclePort
      champion: SeasonChampionPort
    },
  ) {}

  async execute(command: CloseSeasonCommand): Promise<CloseSeasonResult> {
    requireActorPermission(command.actor, "MANAGE_USERS", SEASON_CLOSE_DENIED_MESSAGE)

    const year = closingSeasonYearOfInstant(command.now)
    const candidates = await this.dependencies.cycle.listCandidatesForSeasonClose(year)

    const outcomes: SeasonCloseOutcome[] = []
    let alreadyClosed = 0
    let skippedWithoutActivity = 0

    // Passagem 1: quem já fechou é reportado com os valores DO LIVRO; quem não tem atividade no ano é
    // reportado sem linha; o resto vira candidato a posição.
    const pending: { userId: number; name: string; points: number; completedTasks: number; xp: number }[] = []

    for (const candidate of candidates) {
      const snapshot = await this.dependencies.cycle.getSeasonSnapshot(candidate.userId, year)
      if (snapshot) {
        alreadyClosed += 1
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          year,
          status: "already-closed",
          points: snapshot.points,
          completedTasks: snapshot.completedTasks,
          xp: snapshot.xp,
          elo: snapshot.elo,
          position: snapshot.position,
        })
        continue
      }

      if (!isSeasonParticipant({ monthsInYear: candidate.monthsInYear, xp: candidate.xp })) {
        skippedWithoutActivity += 1
        outcomes.push({
          userId: candidate.userId,
          name: candidate.name,
          year,
          status: "without-activity",
          points: 0,
          completedTasks: 0,
          xp: 0,
          elo: null,
          position: null,
        })
        continue
      }

      pending.push({
        userId: candidate.userId,
        name: candidate.name,
        points: candidate.seasonPoints,
        completedTasks: candidate.seasonCompletedTasks,
        xp: candidate.xp,
      })
    }

    // Passagem 2: a posição é a régua do domínio sobre os participantes do ano. userId é único, então
    // a ordem é total e nenhuma posição fica ambígua.
    const ranked = rankSeasonStandings(pending)
    let closed = 0

    for (const standing of ranked) {
      const written = await this.dependencies.cycle.closeSeason({
        userId: standing.userId,
        year,
        points: standing.points,
        completedTasks: standing.completedTasks,
        xp: standing.xp,
        elo: seasonClosingEloForXp(standing.xp),
        position: standing.position,
      })

      if (!written) {
        // Corrida: outra run escreveu a linha entre a leitura e a escrita. A unique devolveu o não,
        // a coluna não foi zerada de novo, e o que se reporta volta a ser o livro.
        const snapshot = await this.dependencies.cycle.getSeasonSnapshot(standing.userId, year)
        alreadyClosed += 1
        outcomes.push({
          userId: standing.userId,
          name: standing.name,
          year,
          status: "already-closed",
          points: snapshot?.points ?? standing.points,
          completedTasks: snapshot?.completedTasks ?? standing.completedTasks,
          xp: snapshot?.xp ?? standing.xp,
          elo: snapshot?.elo ?? null,
          position: snapshot?.position ?? standing.position,
        })
        continue
      }

      closed += 1
      outcomes.push({
        userId: standing.userId,
        name: standing.name,
        year,
        status: "closed",
        points: standing.points,
        completedTasks: standing.completedTasks,
        xp: standing.xp,
        elo: seasonClosingEloForXp(standing.xp),
        position: standing.position,
      })
    }

    // Passagem 3: o campeão é do livro-caixa, lido depois das escritas.
    const champion = await this.resolveChampion(year)

    return { year, closed, alreadyClosed, skippedWithoutActivity, outcomes, champion }
  }

  private async resolveChampion(year: number): Promise<SeasonChampionResult> {
    const standings = await this.dependencies.cycle.listSeasonStandings(year)
    const ranked = rankSeasonStandings(standings)
    const champion = seasonChampionOf(ranked)

    if (!champion) {
      return { userId: null, name: null, points: 0, badgeId: null, status: "sem-participante" }
    }

    const award = await this.dependencies.champion.awardSeasonChampion({
      year,
      userId: champion.userId,
      badgeName: SEASON_CHAMPION_BADGE_NAME,
      description: seasonChampionDescription(year, champion.userId),
    })

    return {
      userId: champion.userId,
      name: champion.name,
      points: champion.points,
      badgeId: award.badgeId,
      status: award.status,
    }
  }
}
