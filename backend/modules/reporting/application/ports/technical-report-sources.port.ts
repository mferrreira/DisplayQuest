/**
 * TechnicalReportSourcesPort — as três fontes do rascunho (V5-9c, plan V5-9).
 *
 * O plano nomeia as fontes: logs de sessão (`work_sessions`), tarefas do projeto e
 * atividades do cronograma. Adaptador próprio do módulo de reporting (RG-04 — mesmo
 * desenho do `TechnicalReportGenerationPort`). Nenhum cálculo aqui: a janela é o
 * período do relatório (DEC-167), decidida pela regra pura; o adaptador filtra.
 */
import type {
  ReportDraftActivityRow,
  ReportDraftSessionRow,
  ReportDraftTaskRow,
} from "@/backend/domain";

export interface TechnicalReportSourcesPort {
  /** Sessões do projeto com início entre `from` e `to` (datas civis `YYYY-MM-DD`). */
  listSessionLogs(projectId: number, from: string, to: string): Promise<ReportDraftSessionRow[]>;
  listProjectTasks(projectId: number): Promise<ReportDraftTaskRow[]>;
  /** Atividades cujo intervalo de meses cruza [fromMonth, toMonth] (`AAAA-MM`). */
  listCronogramaActivities(
    projectId: number,
    fromMonth: string,
    toMonth: string,
  ): Promise<ReportDraftActivityRow[]>;
}