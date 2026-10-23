import { SEASON_CHAMPION_POSITION, type SeasonKey } from "@/backend/domain/gamification";
import type {
  MonthHistoryRow,
  MonthlyPointsCyclePort,
} from "@/backend/modules/gamification/application/ports/monthly-points-cycle.port";
import type { SeasonCyclePort, SeasonHistoryRow } from "@/backend/modules/gamification/application/ports/season-cycle.port";

/**
 * ReadUserCycleHistoryUseCase — plan-v8 V8-7 (DEC-220). O histórico DA PESSOA: os meses fechados e as
 * temporadas fechadas.
 *
 * O que entra aqui e o motivo:
 *
 * 1. **É o livro, não a coluna.** `month_history` e `season_history` são as memórias que os fechamentos
 *    escrevem (DEC-212/213). A tela não reconstitui mês nenhum a partir de `users.points`/`users.xp`:
 *    as colunas são o mês/ano EM CURSO, e depois da virada elas dizem 0 — quem reconstituisse histórico
 *    pela coluna veria um passado zerado.
 * 2. **Campeão é a posição do livro.** O destaque do perfil lê `position === SEASON_CHAMPION_POSITION`
 *    das linhas da pessoa. Depois do fechamento não existe régua viva que diga quem foi primeiro em
 *    outro ano: o XP foi zerado, e a linha é a única testemunha. A constante é a mesma que concede o
 *    troféu (V8-4), então a tela e a rotina nomeiam o campeão pelo mesmo número.
 * 3. **Ano em curso e mês em curso não têm linha** — e a tela não inventa uma. O livro registra o que
 *    aconteceu (DEC-213), e o quadro do mês em curso é a outra leitura (ListMonthlyRankingUseCase).
 * 4. **Leitura aberta, sem ator**, como `GET /api/user-badges` (dono, 2026-10-07): ver o perfil do
 *    outro inclui ver a memória do placar dele, que é a mesma classe de dado que o ranking já mostra.
 *    A sessão é exigida na rota.
 */
export interface UserCycleHistoryResult {
  /** Meses fechados desta pessoa, do mais recente ao mais antigo. */
  months: MonthHistoryRow[];
  /** Temporadas fechadas desta pessoa, do mais recente ao mais antigo. */
  seasons: SeasonHistoryRow[];
  /** Os anos em que a pessoa fechou na posição do campeão. Vitalício: pode ser mais de um ano. */
  championYears: SeasonKey[];
}

export class ReadUserCycleHistoryUseCase {
  constructor(
    private readonly dependencies: {
      monthlyCycle: MonthlyPointsCyclePort;
      seasonCycle: SeasonCyclePort;
    },
  ) {}

  async execute(query: { userId: number }): Promise<UserCycleHistoryResult> {
    const [months, seasons] = await Promise.all([
      this.dependencies.monthlyCycle.listMonthHistory(query.userId),
      this.dependencies.seasonCycle.listSeasonHistoryForUser(query.userId),
    ]);

    return {
      months,
      seasons,
      championYears: seasons
        .filter((season) => season.position === SEASON_CHAMPION_POSITION)
        .map((season) => season.year),
    };
  }
}
