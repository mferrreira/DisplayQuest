import type { SeasonKey, SeasonStanding } from "@/backend/domain/gamification";

/**
 * SeasonCyclePort — plan-v8 V8-4 (DEC-213). As leituras e as escritas que o fechamento de temporada
 * precisa, na forma mínima, espelhando o ciclo mensal (V8-2): quem fecha, o que o ano já fotografou,
 * se o ano já fechou para a pessoa (com o que a linha do ano diz), e o trio "snapshot + zeragem de
 * pontos + zeragem de XP" numa única transação.
 *
 * A port devolve FATOS, nunca decisão (mesma disciplina da V8-2 e da revisão semanal de XP):
 * `seasonPoints` e `seasonCompletedTasks` são somatórios de `month_history`, `monthsInYear` é a
 * contagem de linhas do ano, `xp` é a coluna lida no instante da chamada. Quem decide se a pessoa
 * entra no livro-caixa e em que posição é o use case, com as regras puras de
 * `backend/domain/gamification/season.ts`.
 */

export interface SeasonCandidate {
  userId: number;
  name: string;
  /** `users.xp` no instante da chamada — a trilha da temporada ainda não zerada. */
  xp: number;
  /** `users.points` no instante da chamada. Informativo: a temporada fotografa o livro de meses, não o saldo. */
  points: number;
  /** Quantos meses do ano têm linha em `month_history`. */
  monthsInYear: number;
  /** Somatório de `month_history.points` do ano (o negativo do snapshot entra na conta). */
  seasonPoints: number;
  /** Somatório de `month_history.completedTasks` do ano. */
  seasonCompletedTasks: number;
}

/** O que a linha do ano diz. É a resposta da reexecução: o livro é a autoridade, não a coluna. */
export interface SeasonSnapshot {
  userId: number;
  year: SeasonKey;
  points: number;
  completedTasks: number;
  xp: number;
  /** Nula enquanto a escada de elo não existe (DEC-217 é a V8-6). */
  elo: string | null;
  position: number | null;
}

export interface SeasonSnapshotWrite {
  userId: number;
  year: SeasonKey;
  points: number;
  completedTasks: number;
  xp: number;
  /** Nulo por decisão: elo é a V8-6 (DEC-217); a posição da temporada é o que existe hoje. */
  elo: string | null;
  position: number;
}

export interface SeasonCyclePort {
  /**
   * Todos os usuários, qualquer status — inclusive suspenso e pendente (audiência ampla, como no
   * fechamento mensal: quem está suspenso na virada fecha histórico, não evapora). Os agregados do
   * ano vêm de uma leitura só, não de uma query por pessoa.
   */
  listCandidatesForSeasonClose(year: SeasonKey): Promise<SeasonCandidate[]>;

  /**
   * "Este ano já fechou para esta pessoa" — a trava da idempotência, lida antes de zerar. Devolve a
   * linha quando existe (o use case reporta os valores DO LIVRO, não os da coluna, que já está 0)
   * e `null` quando o ano ainda não fechou.
   */
  getSeasonSnapshot(userId: number, year: SeasonKey): Promise<SeasonSnapshot | null>;

  /**
   * `season_history` + `users.points = 0` + `users.xp = 0` na MESMA transação: não existe estado em
   * que a temporada está fechada e a trilha aberta, nem o inverso. `users.coins` e `user_badges` não
   * entram aqui — moeda e troféu são vitalícios (MODELO §4). Devolve `false` no conflito de unique
   * `(userId, year)`, que é o backstop da corrida.
   */
  closeSeason(write: SeasonSnapshotWrite): Promise<boolean>;

  /** O livro-caixa do ano lido de volta: é dele que sai o campeão, não da memória da run. */
  listSeasonStandings(year: SeasonKey): Promise<SeasonStanding[]>;
}
