/**
 * plan-v8 V8-1 (DEC-211) — as trilhas da gamificação remodelada.
 *
 * Quatro trilhas, ciclos próprios (MODELO §1): **pontos** (placar do mês, ranking), **moedas**
 * (vitalícia, loja), **XP** (volume da temporada anual) e **troféus** (vitalícios, equipáveis).
 * Pontos/XP/moedas são colunas de `users` com default 0; o ciclo de cada uma é rotina própria
 * (reset mensal V8-2, revisão semanal de XP V8-3, fechamento de temporada V8-4).
 *
 * Este arquivo é o dono do vocabulário da coluna `history.track` (String no schema, default
 * `POINTS` — mesma escolha da DEC-141 para vocabulário: migration de linha sem constraint no
 * banco). Uma linha de `history` passa a dizer de qual trilha fala; `metadata.pointsAwarded`
 * passa a ser lido como o montante da trilha daquela linha, não como "pontos" por definição.
 */

export type GamificationTrack = "POINTS" | "COINS" | "XP";

export const GAMIFICATION_TRACKS: readonly GamificationTrack[] = ["POINTS", "COINS", "XP"];

/**
 * Default da coluna. Toda linha anterior ao plan-v8 fala de pontos: o award antigo incrementava
 * `users.points`, e é POINTS que a linha dele deve dizer depois da migration.
 */
export const DEFAULT_GAMIFICATION_TRACK: GamificationTrack = "POINTS";

/**
 * A trilha do volume da temporada. Nomeada aqui (V8-3, DEC-214) porque o adaptador de award escreve
 * a linha de XP e o adaptador da revisão semanal também: os dois tem que sair do MESMO vocabulário,
 * não de um literal `"XP"` cada um.
 */
export const XP_GAMIFICATION_TRACK: GamificationTrack = "XP";
