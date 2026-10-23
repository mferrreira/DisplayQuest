import {
  currentMonthOfInstant,
  eloForSeasonXp,
  monthWindow,
  rankSeasonStandings,
  type EloTier,
  type MonthKey,
} from "@/backend/domain/gamification";
import type { MonthlyRankingPort, MonthlyRankingRow } from "@/backend/modules/gamification/application/ports/monthly-ranking.port";

/**
 * ListMonthlyRankingUseCase — plan-v8 V8-7 (DEC-220). O quadro do mês em curso (MODELO §3).
 *
 * O que este arquivo decide, e o motivo de cada decisão:
 *
 * 1. **O desempate é a régua da temporada, não uma régua do ranking.** MODELO §3/§4 escrevem a MESMA
 *    ordem nos dois lugares (pontos → tarefas → XP → userId), e `season.ts` documenta que é de
 *    propósito: dois desempates diferentes fariam o campeão da temporada divergir do placar que a
 *    pessoa vê mês a mês. Então o ranking reusa `rankSeasonStandings` — a única ordem da casa. Escrever
 *    um comparador próprio aqui seria exatamente a segunda régua que a DEC-90/96 e a guarda de janelas
 *    (V8-6) entraram para impedir.
 * 2. **`completedTasks` da régua é a tarefa do MÊS.** O nome da coluna de `SeasonStanding` é genérico;
 *    o que entra aqui é `monthTasks` (a janela do mês em curso, contada pelo adaptador com as condições
 *    das duas famílias). A trilha vitalícia `users.completedTasks` não entra no quadro: MODELO §2 — ela
 *    serve de métrica de troféu na janela `vida`, e as contagens mensais vêm da janela/snapshot.
 * 3. **O elo é DERIVADO do XP, aqui também.** O degrau que o quadro mostra é `eloForSeasonXp(xp)` — a
 *    mesma função que decide os slots do equip (V8-6) e que o read model da progressão reporta. Ler a
 *    coluna `users.elo` mostraria um degrau que pode não casar com os slots que a pessoa tem: a coluna é
 *    a cópia que as escritas de XP mantêm, não a régua.
 * 4. **Todos os cadastros entram no quadro.** É o comportamento medido da tela de hoje (a lista de
 *    usuários, ordenada), e o mês é "quadro próprio" a partir de zero — quem ainda não pontuou tem linha
 *    com 0, porque o que o quadro mostra é o placar do mês, não um pódio de selecionados.
 * 5. **Leitura aberta, sem ator.** O quadro de liderança é a leitura pública do laboratório hoje (qualquer
 *    autenticado vê a lista de usuários e seus pontos). Este use case não decide direito nenhum; a sessão
 *    é exigida na rota (`requireApiActor`), como em `GET /api/user-badges`.
 *
 * O `now` entra por parâmetro (lição da DEC-132): a janela do mês é do domínio (`monthWindow` +
 * `currentMonthOfInstant`), e a rota entrega o instante da chamada.
 */
export interface ListMonthlyRankingDependencies {
  ranking: MonthlyRankingPort;
}

export interface MonthlyRankingEntry {
  /** 1-based. A posição da régua, não uma posição de tela. */
  position: number;
  userId: number;
  name: string;
  avatar: string | null;
  bannerKey: string | null;
  roles: string[];
  /** Placar do MÊS em curso (`users.points`). */
  points: number;
  /** Tarefas do MÊS em curso, pela conta das duas famílias. */
  monthTasks: number;
  xp: number;
  coins: number;
  elo: EloTier;
  trophiesEquipped: number;
  trophiesTotal: number;
}

export interface MonthlyRankingResult {
  /** `YYYY-MM` do mês que o quadro mostra — o mesmo MonthKey do fechamento (DEC-212). */
  month: MonthKey;
  rows: MonthlyRankingEntry[];
}

export class ListMonthlyRankingUseCase {
  constructor(private readonly dependencies: ListMonthlyRankingDependencies) {}

  async execute(query: { now: Date }): Promise<MonthlyRankingResult> {
    const month = currentMonthOfInstant(query.now);
    const rows = await this.dependencies.ranking.listRows(monthWindow(month));
    const rowsById = new Map<number, MonthlyRankingRow>(rows.map((row) => [row.userId, row]));

    const ranked = rankSeasonStandings(
      rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        points: row.points,
        completedTasks: row.monthTasks,
        xp: row.xp,
      })),
    );

    return {
      month,
      rows: ranked.flatMap((standing) => {
        const row = rowsById.get(standing.userId);
        // Estruturalmente sempre existe: `ranked` saiu de `rows`. O flatMap é o preço de não escrever
        // `!` num use case que devolve número a uma tela.
        if (!row) return [];
        return [
          {
            position: standing.position,
            userId: row.userId,
            name: row.name,
            avatar: row.avatar,
            bannerKey: row.bannerKey,
            roles: row.roles,
            points: row.points,
            monthTasks: row.monthTasks,
            xp: row.xp,
            coins: row.coins,
            elo: eloForSeasonXp(row.xp),
            trophiesEquipped: row.trophiesEquipped,
            trophiesTotal: row.trophiesTotal,
          },
        ];
      }),
    };
  }
}
