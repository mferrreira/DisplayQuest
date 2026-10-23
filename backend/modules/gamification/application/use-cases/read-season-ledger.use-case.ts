import type { SeasonKey } from "@/backend/domain/gamification";
import type { ClosedSeasonStanding, SeasonCyclePort } from "@/backend/modules/gamification/application/ports/season-cycle.port";

/**
 * ReadSeasonLedgerUseCase — plan-v8 V8-7 (DEC-220). O livro-caixa da última temporada fechada
 * (MODELO §4: "o resultado da temporada fica marcado").
 *
 * Lê o último ano que tem linha no livro e devolve as linhas como elas foram escritas — posição e
 * degrau fotografados, não reconstituídos. Depois da virada o `users.xp` está zerado e o elo voltou ao
 * primeiro degrau, então NENHUMA régua viva sabe hoje quem fechou 2025 em terceiro: só a linha do
 * livro sabe. É por isso que esta leitura não re-aritmética a posição (mesma disciplina que fez o
 * campeão da V8-4 sair do livro lido de volta, e não da memória da run).
 *
 * `year: null` quando nenhuma temporada fechou ainda. Não existe "livro do ano em curso": o ano em
 * curso nunca fecha, do mesmo modo que o mês em curso nunca tem snapshot (DEC-212/213).
 *
 * Leitura aberta, sem ator: o livro-caixa é a memória do quadro de liderança, e o quadro é público ao
 * autenticado (o que a tela de hoje já faz com a lista de usuários).
 */
export interface SeasonLedgerResult {
  year: SeasonKey | null;
  standings: ClosedSeasonStanding[];
}

export class ReadSeasonLedgerUseCase {
  constructor(private readonly dependencies: { cycle: SeasonCyclePort }) {}

  async execute(): Promise<SeasonLedgerResult> {
    const year = await this.dependencies.cycle.latestClosedSeasonYear();
    if (year === null) {
      return { year: null, standings: [] };
    }
    return { year, standings: await this.dependencies.cycle.listSeasonStandings(year) };
  }
}
