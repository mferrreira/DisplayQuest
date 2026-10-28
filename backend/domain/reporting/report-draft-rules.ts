/**
 * Regras puras do rascunho de IA do relatório técnico (V5-9c, DEC-139/152/168).
 *
 * O prompt é construído aqui, no domínio, e a IA é uma porta (`ReportDraftPort`): o
 * adaptador OpenAI-compatible só transporta texto. As três linhas de cabeçalho saem de
 * `REPORT_SECTIONS` — a MESMA constante que o `splitReportBody` usa para cortar o corpo
 * nas tabelas do oficial (DEC-168): prompt e cortador falam a mesma tabela porque
 * consomem a mesma fonte, e o texto que a IA devolve é exatamente o formato que o
 * gerador DOCX consome.
 *
 * A regra de honestidade não é enfeite: o rascunho nasce de logs de sessão, tarefas e
 * cronograma — material que descreve ATIVIDADE, não resultado. Sem a instrução explícita
 * de não inventar e de deixar seção vazia sem evidência, o modelo preenche "Principais
 * Resultados" com publicações fictícias, e o documento sai oficial por fora e falso por
 * dentro.
 */
import { REPORT_SECTIONS } from "./technical-report-document-rules";
import type { TechnicalReportType } from "./technical-report-rules";

export interface ReportDraftSessionRow {
  /** Data civil do início da sessão (`YYYY-MM-DD`). */
  date: string;
  userName: string;
  activity: string | null;
  /**
   * Duração em HORAS. O nome carrega a unidade de propósito: `work_sessions.duration` é
   * `Float` em SEGUNDOS (o timer flutuante escreve segundos), e o adaptador converte.
   * Achado medido 2026-10-14: sem a conversão o prompt recebia "6189.595h" — a IA lia
   * segundos rotulados de horas e o rascunho saía absurdo.
   */
  durationHours: number | null;
  location: string | null;
}

export interface ReportDraftTaskRow {
  title: string;
  status: string;
  /** Data civil da conclusão (`YYYY-MM-DD`) ou nula. */
  completedAt: string | null;
  points: number;
}

export interface ReportDraftActivityRow {
  description: string;
  firstMonth: string;
  lastMonth: string;
  status: string;
  evidenceCount: number;
}

export interface ReportDraftPromptInput {
  project: {
    name: string;
    proppiNumber: string | null;
    leaderName: string | null;
  };
  type: TechnicalReportType;
  period: { periodoInicio: string; periodoFim: string };
  sessions: ReportDraftSessionRow[];
  tasks: ReportDraftTaskRow[];
  activities: ReportDraftActivityRow[];
}

function sectionLines(): string {
  // A grafia de exibição da chave: o formato que o humano digita e que o
  // `splitReportBody` casa pela `matchKey` normalizada (DEC-168).
  return REPORT_SECTIONS.map((section) => section.draftLabel).join("\n");
}

function sessionLines(sessions: ReportDraftSessionRow[]): string {
  if (sessions.length === 0) return "- sem registros";
  return sessions
    .map(
      (session) =>
        `- ${session.date} | ${session.userName} | ${session.activity ?? "sem descrição"} | ` +
        `${session.durationHours ?? "?"}h${session.location ? ` | ${session.location}` : ""}`,
    )
    .join("\n");
}

function taskLines(tasks: ReportDraftTaskRow[]): string {
  if (tasks.length === 0) return "- sem registros";
  return tasks
    .map(
      (task) =>
        `- ${task.title} | status ${task.status}` +
        `${task.completedAt ? ` (concluída em ${task.completedAt})` : ""} | ${task.points} pts`,
    )
    .join("\n");
}

function activityLines(activities: ReportDraftActivityRow[]): string {
  if (activities.length === 0) return "- sem registros";
  return activities
    .map(
      (activity) =>
        `- ${activity.description} | ${activity.firstMonth} a ${activity.lastMonth} | ` +
        `status ${activity.status} | ${activity.evidenceCount} prova(s)`,
    )
    .join("\n");
}

/**
 * O prompt do rascunho. Congelado em teste: as três chaves de seção na ordem canônica,
 * a regra de honestidade (não invente; seção vazia sem evidência), projeto/tipo/período,
 * as três fontes com seus dados, fonte vazia declarada "sem registros", e texto puro em
 * português.
 */
export function buildTechnicalReportDraftPrompt(input: ReportDraftPromptInput): string {
  if (input.type === "final") {
    return [
      `Redija o manuscrito final de iniciação científica do projeto “${input.project.name}” ` +
        `${input.project.proppiNumber ? `(${input.project.proppiNumber}) ` : ""}` +
        `para o período ${input.period.periodoInicio} a ${input.period.periodoFim}.`,
      "",
      "Siga as diretrizes RECITAL/IFNMG e ABNT NBR 6022:2018. Produza texto acadêmico claro, coeso, " +
        "preciso e impessoal, com título e resumo em português e inglês, palavras-chave e keywords, " +
        "introdução, referencial teórico, metodologia, resultados e discussão, conclusão e referências.",
      "",
      "REGRAS DE EVIDÊNCIA: use apenas fatos sustentados pelas fontes abaixo. Os registros documentam " +
        "atividades, tarefas e cronograma, mas podem não conter dados, instrumentos, amostra, análise, " +
        "resultados ou bibliografia. Não invente métodos, números, conclusões nem citações. Quando faltar " +
        "base, mantenha a seção e escreva [COMPLEMENTAÇÃO DA AUTORIA: indique precisamente o dado ou a " +
        "referência que precisa ser fornecido]. Não apresente esse marcador como parte do artigo publicado.",
      "",
      "Estrutura obrigatória, nesta ordem e com estes títulos:",
      "Título (português)\nTítulo (English)\nResumo\nPalavras-chave\nAbstract\nKeywords\n" +
        "1 Introdução\n2 Referencial teórico\n3 Metodologia\n4 Resultados e discussão\n5 Conclusão\nReferências",
      "",
      "Não transforme tarefas concluídas em resultados científicos sem evidência observável. Não crie " +
        "referências. Se fontes não contiverem literatura citada, sinalize a lacuna em Referências.",
      "",
      "Registros de sessão de trabalho do período:", sessionLines(input.sessions), "",
      "Tarefas do projeto:", taskLines(input.tasks), "",
      "Atividades do cronograma do projeto:", activityLines(input.activities),
    ].join("\n");
  }
  return [
    `Você escreve o corpo do relatório ${input.type} de Iniciação Científica do projeto ` +
      `"${input.project.name}"` +
      `${input.project.proppiNumber ? ` (${input.project.proppiNumber})` : ""}` +
      `${input.project.leaderName ? `, coordenado por ${input.project.leaderName}` : ""}. ` +
      `Período a que o relatório se refere: ${input.period.periodoInicio} a ${input.period.periodoFim}.`,
    "",
    "Escreva em português, em texto puro, exatamente nestas três seções, nesta ordem, " +
      "usando estas três linhas de cabeçalho, cada uma sozinha em sua linha:",
    "",
    sectionLines(),
    "",
    "Regra de honestidade: escreva apenas o que tem âncora nos registros abaixo; não invente " +
      "resultados, publicações ou patentes que não aparecem nas fontes; se uma seção não tem " +
      "evidência, deixe-a vazia (nenhum texto entre ela e o próximo cabeçalho).",
    "",
    "Registros de sessão de trabalho do período:",
    sessionLines(input.sessions),
    "",
    "Tarefas do projeto:",
    taskLines(input.tasks),
    "",
    "Atividades do cronograma do projeto:",
    activityLines(input.activities),
  ].join("\n");
}
