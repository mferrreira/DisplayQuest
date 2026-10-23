import { civilDayOfInstant } from "@/backend/domain/time/civil-day";

/**
 * Regras puras da temporada (plan-v8 V8-4, DEC-213) — MODELO §4.
 *
 * A temporada é o ANO CIVIL (rodada 5 do dono: "a temporada é ANUAL, o mês reseta os pontos, mas
 * não é uma season"). Na virada, o que fecha é o livro-caixa anual (`season_history`) e o que zera
 * são as trilhas da temporada: pontos, XP e elo. **Moedas e troféus conquistados não resetam** —
 * são vitalícios, e é por isso que esta rotina não toca em `users.coins` nem em `user_badges`.
 *
 * Duas coisas este arquivo decide, e nenhuma das duas o adaptador decide:
 *
 *   - **o ano que fecha**: o ano civil ANTERIOR ao `now` da run, visto em America/Sao_Paulo
 *     (DEC-132). O job roda em 1º/jan às 00:05, cinco minutos depois do fechamento mensal das
 *     00:00 — que fotografou dezembro do ano que terminou — então o somatório do ano recém-fechado
 *     já inclui dezembro. Nenhum ano em curso é fechado nunca, do mesmo modo que nenhum mês em
 *     curso é fechado pela rotina mensal.
 *   - **a ordem da temporada**: pontos → tarefas → XP → userId (MODELO §3/§4, desempate confirmado
 *     na rodada 6). `userId` é único, então a ordem é TOTAL: existe exatamente um primeiro colocado,
 *     e o CAMPEÃO nunca precisa de "conceder a todos os empatados" — o desempate termina antes.
 *
 * O ELO não está aqui de propósito: a escada BRONZE→DESAFIANTE com umbrais 0/400/900/1500/2400/3600
 * é a DEC-217 e entra na V8-6. Enquanto ela não existe, não há elo armazenado em lugar nenhum
 * (`Progression.ts` deriva elo de pontos e nenhuma coluna guarda o valor), então o livro-caixa grava
 * `elo` nulo e a posição da temporada. Antecipar a escada aqui seria a V8-6 entrando de contrabando.
 */

/** Ano civil da temporada. `season_history.year` é Int, então o `SeasonKey` é número, não string. */
export type SeasonKey = number;

export const SEASON_POINTS_AFTER_CLOSE = 0;
export const SEASON_XP_AFTER_CLOSE = 0;

/**
 * Nome do troféu concedido ao primeiro colocado, resolvido no catálogo por NOMES (o badge é seedado
 * pela data migration `prisma/data-migrations/v8-4-badge-campeao.sql` com `criteria = NULL`: com
 * critério nulo o motor atual de avaliação não concede o troféu a ninguém — é a rotina de fechamento
 * que concede, e só a ela).
 */
export const SEASON_CHAMPION_BADGE_NAME = "CAMPEÃO";

/** O ano que a run de fechamento fecha: o anterior ao ano civil do instante, em SP. */
export function closingSeasonYearOfInstant(instant: Date): SeasonKey {
  const [year] = civilDayOfInstant(instant).split("-").map(Number);
  return year - 1;
}

/**
 * O prefixo que seleciona os meses de uma temporada em `month_history.month` (`YYYY-MM`).
 * Mora aqui porque o formato do mês é do domínio (`monthly-cycle.ts`), e o filtro do adaptador tem
 * que sair da mesma fonte — um `LIKE '2025%'` escrito à mão no SQL é o mesmo erro da DEC-90/96.
 */
export function seasonMonthPrefix(year: SeasonKey): string {
  return `${year}-`;
}

/**
 * Quem entra no livro-caixa da temporada. A audiência é ampla como a do fechamento mensal, mas o
 * critério é outro: a pessoa tem linha quando o ANO tem atividade fotografada (algum mês do ano com
 * snapshot) ou quando a trilha da temporada está aberta (`xp ≠ 0`). Quem não tem nenhum dos dois não
 * ganha linha de zeros — o livro-caixa registra o que aconteceu, não um 0 por cadastro.
 */
export function isSeasonParticipant(input: { monthsInYear: number; xp: number }): boolean {
  return input.monthsInYear > 0 || input.xp !== 0;
}

export interface SeasonStanding {
  userId: number;
  name: string;
  /** Somatório dos `month_history` do ano — o mesmo placar que o ranking mostrou mês a mês. */
  points: number;
  /** Somatório das tarefas fotografadas nos snapshots do ano. */
  completedTasks: number;
  /** XP da temporada, lido da coluna no instante do fechamento. */
  xp: number;
}

export interface RankedSeasonStanding extends SeasonStanding {
  /** 1-based. Posição 1 é o CAMPEÃO. */
  position: number;
}

/**
 * A régua de desempate da temporada (MODELO §3 para o ranking mensal e §4 para o campeão, a MESMA
 * ordem em os dois lugares — dois desempates diferentes fariam o campeão divergir do placar que a
 * pessoa vê). Pontos, tarefas e XP são decrescentes; `userId` crescente é o que fecha a ordem.
 */
export function compareSeasonStandings(a: SeasonStanding, b: SeasonStanding): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.completedTasks !== b.completedTasks) return b.completedTasks - a.completedTasks;
  if (a.xp !== b.xp) return b.xp - a.xp;
  return a.userId - b.userId;
}

/** Ordena e numera. Estável porque a ordem é total (userId único) — nenhuma posição fica ambígua. */
export function rankSeasonStandings(standings: ReadonlyArray<SeasonStanding>): RankedSeasonStanding[] {
  return [...standings]
    .sort((a, b) => compareSeasonStandings(a, b))
    .map((standing, index) => ({ ...standing, position: index + 1 }));
}

/** O primeiro colocado da temporada, ou `null` quando ninguém entrou no livro-caixa. */
export function seasonChampionOf(ranked: ReadonlyArray<RankedSeasonStanding>): RankedSeasonStanding | null {
  return ranked.length === 0 ? null : ranked[0];
}

/**
 * A chave de reexecução do troféu do ano. Não existe tabela para o campeão, então a linha do próprio
 * livro-caixa de auditoria é a chave (mesma escolha da revisão semanal de XP, V8-3): `season_history`
 * já é idempotente pela unique `(userId, year)`, e esta chave torna o TROFÉU idempotente por ano.
 */
export function seasonChampionDescription(year: SeasonKey, userId: number): string {
  return `GAMIFICATION:SEASON_CHAMPION:${year}:${userId}`;
}
