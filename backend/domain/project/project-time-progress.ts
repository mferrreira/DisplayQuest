/**
 * backend/domain/project/project-time-progress.ts — andamento temporal do projeto
 * (V5-11, DEC-63/132).
 *
 * O gráfico que o dono pediu é `data_final − dia_de_hoje`. É aritmética de DIA CIVIL
 * (DEC-132): `projects.startDate`/`endDate` são `YYYY-MM-DD` e o "hoje" entra como
 * parâmetro do chamador — a regra nunca lê `new Date()`. Aceita instantâneo ISO na
 * entrada (linhas legadas) porque `civilDayOfDate` resolve os dois formatos para o MESMO
 * dia do calendário do laboratório.
 *
 * O percentual é do TEMPO do período, não de tarefas: a premiação do projeto
 * (`projects.points`, DEC-63) já tem exibição própria, e as duas coisas não devem ser
 * confundidas na tela.
 */
import { civilDayOfDate, civilDaysBetween } from "@/backend/domain/time/civil-day";

export type ProjectTimeProgressState = "sem_datas" | "antes_do_inicio" | "em_execucao" | "encerrado";

export interface ProjectTimeProgress {
  state: ProjectTimeProgressState;
  /** Dias do período (início → término); mínimo 1. `null` sem data de início. */
  totalDays: number | null;
  /** Dias decorridos do período. `null` sem data de início. */
  elapsedDays: number | null;
  /** Dias de hoje até o término, nunca negativos. */
  remainingDays: number | null;
  /** Só `antes_do_inicio`: dias de hoje até o início. */
  daysUntilStart: number | null;
  /** Só `encerrado`: dias do término até hoje. */
  daysSinceEnd: number | null;
  /** 0..100 do tempo do período; 0 quando não há período a medir. */
  percent: number;
}

export function projectTimeProgress(
  input: { startDate?: string | null; endDate?: string | null },
  today: string,
): ProjectTimeProgress {
  const start = input.startDate ? civilDayOfDate(input.startDate) : null;
  const end = input.endDate ? civilDayOfDate(input.endDate) : null;

  if (end === null) {
    return {
      state: "sem_datas",
      totalDays: null,
      elapsedDays: null,
      remainingDays: null,
      daysUntilStart: null,
      daysSinceEnd: null,
      percent: 0,
    };
  }

  const totalDays = start !== null ? Math.max(1, civilDaysBetween(start, end)) : null;
  const remainingDays = Math.max(0, civilDaysBetween(today, end));

  if (start !== null && civilDaysBetween(today, start) > 0) {
    return {
      state: "antes_do_inicio",
      totalDays,
      elapsedDays: 0,
      remainingDays: civilDaysBetween(today, end),
      daysUntilStart: civilDaysBetween(today, start),
      daysSinceEnd: null,
      percent: 0,
    };
  }

  if (civilDaysBetween(today, end) < 0) {
    return {
      state: "encerrado",
      totalDays,
      elapsedDays: totalDays ?? null,
      remainingDays: 0,
      daysUntilStart: null,
      daysSinceEnd: civilDaysBetween(end, today),
      percent: totalDays === null ? 0 : 100,
    };
  }

  // Decorrido = total − faltante: `elapsed + remaining == total` em todo ramo com período
  // (congelado em teste). No dia exato do término o período inteiro já correu — o prazo é
  // dentro (DEC-166), e um período de um dia no seu dia é 100%, não 0%.
  const elapsedDays = totalDays !== null ? totalDays - remainingDays : null;
  const percent =
    totalDays !== null && elapsedDays !== null ? Math.round((elapsedDays / totalDays) * 100) : 0;
  return {
    state: "em_execucao",
    totalDays,
    elapsedDays,
    remainingDays,
    daysUntilStart: null,
    daysSinceEnd: null,
    percent,
  };
}
