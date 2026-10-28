/**
 * backend/domain/gamification/board-tracks.ts — plan-v9 (ADR-002, DEC-224).
 *
 * Trilha e o nome de um contador de gamificacao que o quadro de lideranca sabe ordenar. Hoje
 * existe uma so: o placar do mes. O nome existe para a expansao nao precisar renomear nada:
 * uma trilha futura (XP de temporada, moeda) entra por aqui e o fechamento de mes ja guarda
 * `track` por linha (ADR-002).
 *
 * INV6 do MODELO: o vocabulario mora aqui. Rota, tela e MCP repetem o que o dominio nomeia;
 * nenhum deles declara lista propria (lição medida na DEC-95/96).
 */

import { ValidationError } from "../errors";

export const BOARD_TRACKS = {
  /** Placar do mes em curso: o numero que o Quadro de Lideranca ordena e que zera no fechamento. */
  MONTH_POINTS: "MONTH_POINTS",
} as const;

export type BoardTrack = (typeof BOARD_TRACKS)[keyof typeof BOARD_TRACKS];

export const BOARD_TRACK_LIST: BoardTrack[] = [BOARD_TRACKS.MONTH_POINTS];

export function isBoardTrack(value: unknown): value is BoardTrack {
  return typeof value === "string" && (BOARD_TRACK_LIST as string[]).includes(value);
}

/**
 * Reconciliação da fronteira de leitura: `board_month_closes.track` e `month_history.track` são
 * colunas `String`, e a linha lida tem que voltar no vocabulário do domínio ou falhar nomeando o
 * valor (mesma disciplina de `toUserStatus`, DEC-125). Ler trilha desconhecida como se fosse a do
 * mês faria a tela mostrar um quadro que não existe.
 */
export function toBoardTrack(value: unknown): BoardTrack {
  if (!isBoardTrack(value)) {
    throw new ValidationError(`trilha do quadro desconhecida: ${String(value)}`, {
      details: { track: String(value) },
    });
  }
  return value;
}
