/**
 * Regras puras do documento DOCX do relatório técnico (V5-9b, DEC-129/167/168).
 *
 * O corpo é UM texto por relatório (DEC-139) e é distribuído nas três tabelas do
 * oficial pelas linhas de cabeçalho (DEC-168 — três juízes Big Pickle unânimes):
 * casamento pela LINHA INTEIRA normalizada (rótulo oficial ou chave curta), nunca
 * substring — falso positivo roteia conteúdo para a tabela errada em silêncio, e é o
 * lado caro do erro. Sem cabeçalho o texto inteiro vai na Descrição: o ramo degenerado
 * é o "tudo na tabela 1", nunca um erro nem texto inventado. Seção sem corpo fica
 * vazia — placeholder fabricado dentro de documento oficial não existe aqui.
 *
 * Datas civis (DEC-132): o período é comparado como `YYYY-MM-DD` e formatado por
 * substring; `new Date` não entra. Os rótulos de modalidade/fomento vêm das MESMAS
 * tabelas de `person-data-rules` que a tela de perfil usa (lição DEC-96).
 */
import {
  FUNDING_AGENCY_LABELS,
  SCHOLARSHIP_TYPE_LABELS,
} from "../identity/person-data-rules";
import { civilDayOfDate } from "../time/civil-day";
import { technicalReportCheckbox } from "./technical-report-rules";
import type { TechnicalReportType } from "./technical-report-rules";

/**
 * As três seções canônicas, na ordem do oficial, com o rótulo medido no documento
 * (2026-10-14) e a chave curta aceita. Fonte ÚNICA: o prompt da IA (V5-9c), o cortador
 * e o adaptador DOCX consomem esta lista — nenhum deles escreve título à mão (DEC-90).
 */
export interface ReportSection {
  id: "descricao" | "resultados" | "comentarios";
  /** Literal medido no oficial, parênteses e espaços incluídos. */
  officialLabel: string;
  /** Forma curta que o rascunho de IA é instruído a escrever e o humano digita. */
  matchKey: string;
  /** Grafia de exibição da chave (usada no prompt da IA); o casamento é por `matchKey`. */
  draftLabel: string;
}

export const REPORT_SECTIONS: readonly ReportSection[] = [
  {
    id: "descricao",
    officialLabel: "Descrição das Atividades Desenvolvidas pelo Estudante ( etapa/cronograma)",
    matchKey: "descrição das atividades",
    draftLabel: "Descrição das Atividades",
  },
  {
    id: "resultados",
    officialLabel: "Principais Resultados Alcançados ( publicações, patentes, participações, outros):",
    matchKey: "principais resultados",
    draftLabel: "Principais Resultados",
  },
  {
    id: "comentarios",
    officialLabel: "Comentários Adicionais ( dificuldades/ observações/sugestões/ outros):",
    matchKey: "comentários adicionais",
    draftLabel: "Comentários Adicionais",
  },
];

export interface ReportBody {
  descricao: string;
  resultados: string;
  comentarios: string;
}

/**
 * Normalização de linha: trim, decoração de markdown no começo, caixa alta, acentos,
 * espaços colapsados, espaços dentro de parênteses e dois-pontos finais. A MESMA
 * função normaliza a linha do texto e a forma aceita — nada é transcrito à mão.
 */
function normalizeReportLine(line: string): string {
  return line
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^[#*>-]+\s*/, "")
    .replace(/^\d+\.\s+/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/:$/, "")
    .trim();
}

const ACCEPTED_HEADER_LINES = new Map<string, ReportSection["id"]>();
for (const section of REPORT_SECTIONS) {
  ACCEPTED_HEADER_LINES.set(normalizeReportLine(section.officialLabel), section.id);
  ACCEPTED_HEADER_LINES.set(normalizeReportLine(section.matchKey), section.id);
}

/**
 * Corta o corpo único nas três tabelas (DEC-168). Regras congeladas em teste:
 * cabeçalho é linha inteira normalizada; preâmbulo vai na Descrição; cabeçalho
 * duplicado abre um novo bloco na MESMA tabela (blocos separados por linha em
 * branco); a tabela de destino é por chave, não por posição; texto antes de
 * qualquer cabeçalho reconhecido pertence à Descrição.
 */
export function splitReportBody(text: string, type?: TechnicalReportType): ReportBody {
  if (type === "final") {
    const sections: Record<ReportSection["id"], string[]> = { descricao: [], resultados: [], comentarios: [] };
    let target: ReportSection["id"] = "descricao";
    for (const line of text.split(/\r\n|\r|\n/)) {
      const heading = normalizeReportLine(line);
      if (/^(4\s+)?resultados(\s+e\s+discussao)?$/.test(heading) || heading === "discussao") target = "resultados";
      else if (/^(5\s+)?conclusao$/.test(heading) || heading === "referencias") target = "comentarios";
      else if (/^(1\s+)?introducao$/.test(heading) || /^(2\s+)?referencial teorico$/.test(heading) || /^(3\s+)?metodologia$/.test(heading)) target = "descricao";
      sections[target].push(line);
    }
    return {
      descricao: sections.descricao.join("\n").trim(),
      resultados: sections.resultados.join("\n").trim(),
      comentarios: sections.comentarios.join("\n").trim(),
    };
  }
  const blocks: Record<ReportSection["id"], string[][]> = {
    descricao: [[]],
    resultados: [],
    comentarios: [],
  };
  let current: ReportSection["id"] = "descricao";

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const header = ACCEPTED_HEADER_LINES.get(normalizeReportLine(rawLine));
    if (header !== undefined) {
      current = header;
      blocks[header].push([]); // cabeçalho abre bloco novo na mesma tabela
      continue;
    }
    const block = blocks[current][blocks[current].length - 1];
    if (block) block.push(rawLine);
  }

  const render = (sectionBlocks: string[][]): string =>
    sectionBlocks
      .map((block) => block.join("\n").trim())
      .filter((block) => block.length > 0)
      .join("\n\n");

  return {
    descricao: render(blocks.descricao),
    resultados: render(blocks.resultados),
    comentarios: render(blocks.comentarios),
  };
}

/**
 * A linha de checkbox literal medida no oficial: "( ) Relatório Final (  ) Relatório
 * Parcial" — a primeira caixa tem UM espaço, a segunda DOIS. O sistema só troca o
 * interior da caixa marcada; os espaços do oficial permanecem (DEC-129). A marca é **X**
 * maiúsculo (DEC-174): é a grafia do estado ligado no próprio AcroForm do oficial (`/X`)
 * e a da brochura ("Marque com X os meses") — o `x` minúsculo era um terceiro jeito.
 */
export function technicalReportCheckboxLine(type: TechnicalReportType): string {
  return technicalReportCheckbox(type) === "parcial"
    ? "( ) Relatório Final ( X ) Relatório Parcial"
    : "( X ) Relatório Final (  ) Relatório Parcial";
}

export interface TechnicalReportDocumentProject {
  createdAt: string;
  startDate: string | null;
  endDate: string | null;
}

export interface TechnicalReportDocumentPeriod {
  periodoInicio: string;
  periodoFim: string;
}

/**
 * O período a que o relatório se refere é o do projeto CORTADO na data de geração:
 * início é `startDate` (fallback `createdAt`), fim é min(`endDate`, hoje). Relatório
 * parcial gerado no meio do projeto não declara período futuro, e relatório atrasado
 * não estende o período. Comparação lexicográfica de `YYYY-MM-DD` (DEC-132).
 *
 * As bordas passam por `civilDayOfDate` (a peça única que resolve `YYYY-MM-DD` e
 * instantâneo ISO para o MESMO dia do calendário): o `createdAt` legado da instância é
 * instantâneo ISO completo (escrito antes da DEC-132), e solto no período ele montava
 * `new Date("2026-09-22T15:34:08.043ZT00:00:00.000Z")` no adaptador de sessões —
 * Invalid Date, Prisma explodia e a rota do rascunho respondia 502 sem chamar a IA
 * (achado medido 2026-10-14). Valor sem leitura conta como ausente: o período colapsa
 * em hoje, nunca vira Invalid Date na mão do adaptador.
 */
export function technicalReportDocumentPeriod(
  project: TechnicalReportDocumentProject,
  now: string,
): TechnicalReportDocumentPeriod {
  const periodoInicio = civilDayOfDate(project.startDate ?? project.createdAt) ?? now;
  const end = project.endDate === null ? null : civilDayOfDate(project.endDate);
  const periodoFim = end !== null && end < now ? end : now;
  return { periodoInicio, periodoFim };
}

/** Data civil `YYYY-MM-DD` → `dd/mm/aaaa` por substring. Valor ausente ou malformado é vazio. */
export function formatDocumentCivilDay(value: string | null): string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

/** Chave do DOCX no bucket: derivada do par e do membro — regenerar sobrescreve (DEC-101/133). */
export function technicalReportFileKey(projectId: number, reportId: number, userId: number): string {
  return `projects/${projectId}/technical-reports/${reportId}/${userId}.docx`;
}

/**
 * Nome de exibição do arquivo (download da tela): tipo + nome do membro em slug ASCII.
 * A chave do bucket é derivada e estável; o nome é só o que o navegador mostra.
 */
export function technicalReportFileName(type: TechnicalReportType, memberName: string): string {
  const slug = memberName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `relatorio-${type}${slug ? `-${slug}` : ""}.docx`;
}

export interface TechnicalReportDocumentInput {
  project: {
    name: string;
    createdAt: string;
    startDate: string | null;
    endDate: string | null;
    proppiNumber: string | null;
    leaderName: string | null;
  };
  member: {
    name: string;
    course: string | null;
    /** Token de `users` (a leitura não garante a lista fechada — valor fora dela vira linha em branco). */
    scholarshipType: string | null;
    fundingAgency: string | null;
    fundingAgencyOther: string | null;
  };
  type: TechnicalReportType;
  content: string;
  /** Data civil da geração (`YYYY-MM-DD`), sempre parâmetro, nunca `new Date()` (regra da casa). */
  now: string;
}

function fundingAgencyText(
  agency: string | null,
  other: string | null,
): string {
  if (agency === null) return "";
  if (agency === "OUTRA") return other && other.trim().length > 0 ? other.trim() : FUNDING_AGENCY_LABELS.OUTRA;
  return (FUNDING_AGENCY_LABELS as Record<string, string>)[agency] ?? "";
}

function scholarshipTypeText(token: string | null): string {
  if (token === null) return "";
  return (SCHOLARSHIP_TYPE_LABELS as Record<string, string>)[token] ?? "";
}

/**
 * Os 17 comandos da cópia marcada (13 do V5-1a + linha_tipo + 3 tabelas do V5-9b).
 * Coordenador e orientador são o líder do projeto: o sistema tem um só campo de
 * responsabilidade do projeto (`leaderId`), e o oficial tem as duas linhas.
 * Ausência vira linha em branco — o sistema não inventa conteúdo (DEC-129).
 */
export function buildTechnicalReportCommands(
  input: TechnicalReportDocumentInput,
): Record<string, string> {
  const period = technicalReportDocumentPeriod(input.project, input.now);
  const body = splitReportBody(input.content, input.type);
  return {
    periodo_inicio: formatDocumentCivilDay(period.periodoInicio),
    periodo_fim: formatDocumentCivilDay(period.periodoFim),
    titulo: input.project.name,
    proppi: input.project.proppiNumber ?? "",
    coordenador: input.project.leaderName ?? "",
    projeto_inicio: formatDocumentCivilDay(input.project.startDate ?? input.project.createdAt),
    projeto_termino: formatDocumentCivilDay(input.project.endDate),
    orientador: input.project.leaderName ?? "",
    estudante_nome: input.member.name,
    estudante_curso: input.member.course ?? "",
    modalidade: scholarshipTypeText(input.member.scholarshipType),
    instituicao_fomento: fundingAgencyText(input.member.fundingAgency, input.member.fundingAgencyOther),
    data_relatorio: formatDocumentCivilDay(input.now),
    linha_tipo: technicalReportCheckboxLine(input.type),
    tabela_descricao: body.descricao,
    tabela_resultados: body.resultados,
    tabela_comentarios: body.comentarios,
  };
}
