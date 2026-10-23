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
 * banco). Uma linha de `history` passa a dizer de qual trilha fala, e a chave do montante no JSON
 * nomeia a trilha da linha: `pointsAwarded` na linha de pontos, `coinsAwarded` na de moeda (V8-5,
 * DEC-215), `xpAwarded` na de XP (V8-3, DEC-214). Linhas escritas antes da V8-5 trazem
 * `pointsAwarded` e continuam falando de pontos — é o que a coluna `track` nelas diz.
 */

const POINTS_TRACK = "POINTS" as const;
const COINS_TRACK = "COINS" as const;
const XP_TRACK = "XP" as const;

/**
 * O vocabulário, em constantes nomeadas (V8-5): quem escreve uma linha de ledger usa a constante e
 * o `tsc` estreita o tipo dela. Um `GamificationTrack` genérico não estreita, e foi assim que o
 * adaptador de award perdeu a garantia de "coluna certa para a trilha certa".
 */
export const POINTS_GAMIFICATION_TRACK = POINTS_TRACK;
export const COINS_GAMIFICATION_TRACK = COINS_TRACK;
export const XP_GAMIFICATION_TRACK = XP_TRACK;

export type GamificationTrack = typeof POINTS_TRACK | typeof COINS_TRACK | typeof XP_TRACK;

export const GAMIFICATION_TRACKS: readonly GamificationTrack[] = [POINTS_TRACK, COINS_TRACK, XP_TRACK];

/**
 * Default da coluna. Toda linha anterior ao plan-v8 fala de pontos: o award antigo incrementava
 * `users.points`, e é POINTS que a linha dele deve dizer depois da migration.
 */
export const DEFAULT_GAMIFICATION_TRACK: GamificationTrack = POINTS_TRACK;

/**
 * plan-v8 V8-5 (DEC-215): a trilha que um PRÊMIO credita em saldo — o credit de um evento escreve
 * uma coluna de `users`, e as duas possíveis são as duas de saldo vitalício/mensal. XP nunca é
 * trilha primária de um award: ele entra pelo bloco `xp` do record (DEC-214), porque uma linha de
 * ledger fala de uma trilha só e o credit de pontos/moedas e o de XP são linhas diferentes.
 * O `tsc` recusa `track: "XP"` num record de award por causa deste tipo.
 */
export type AwardBalanceTrack = typeof POINTS_TRACK | typeof COINS_TRACK;
