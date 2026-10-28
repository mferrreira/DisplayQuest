import { BOARD_TRACKS, type BoardTrack } from "@/backend/domain/gamification/board-tracks";
import { civilMonthLabel, civilMonthOfInstant } from "@/backend/domain/time/civil-day";

/**
 * ReadBoardMonthUseCase — plan-v9 S01 (MODELO R4, ADR-002, DEC-224).
 *
 * Diz qual mes o Quadro de Liderança esta usando e com que trilha. A tela nao calcula mes:
 * `new Date("2026-10")` e meia-noite UTC e o rotulo deslocaria para setembro no fuso do
 * laboratorio (medição do V5-2b, DEC-132). O mes sai do dominio, o rotulo sai do dominio, e a
 * pagina imprime o que recebeu.
 *
 * `now` entra por parametro. Nenhum use case deste repo chama `new Date()` dentro de regra
 * (regra da casa em backend/domain).
 */
export interface BoardMonthRead {
  /** `AAAA-MM` do mes civil em curso. */
  month: string;
  /** Rotulo pronto para leitura humana ("outubro de 2026"), derivado da tabela do dominio. */
  monthLabel: string;
  /** O que a ordem do quadro significa neste mes. */
  track: BoardTrack;
  closed: false;
}

export class ReadBoardMonthUseCase {
  execute(now: Date): BoardMonthRead {
    const month = civilMonthOfInstant(now);
    const monthLabel = civilMonthLabel(month);
    if (!monthLabel) {
      // So acontece com um instante impossivel; ainda assim nomeia o campo em vez de devolver
      // um rotulo vazio para a tela.
      throw new Error(`mes civil invalido: ${month}`);
    }
    return { month, monthLabel, track: BOARD_TRACKS.MONTH_POINTS, closed: false };
  }
}
