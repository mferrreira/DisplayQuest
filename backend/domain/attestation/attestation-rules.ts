/**
 * Regras puras do atestado de frequência (V5-10a, DEC-75/130/140/170/171).
 *
 * A semântica de cada campo saiu da FOLHA OFICIAL MEDIDA (V5-1a/DEC-130): os rótulos
 * estáticos do AcroForm foram decodificados do stream de conteúdo (texto CID + ToUnicode) e
 * amarrados aos retângulos dos 42 campos. Nada aqui inventa: campo sem fonte no sistema
 * fica de fora do preenchimento (a honestidade da DEC-168 vale para o PDF).
 *
 * O `now` entra como data civil já decomposta (`dia`/`mes`/`ano`) — a regra não toca
 * `new Date()` (DEC-132), quem decompõe é o use case com `civilDayOfInstant`.
 */
import { ValidationError } from "../errors";
import {
  FUNDING_AGENCIES,
  SCHOLARSHIP_TYPES,
  USER_LEVELS,
  type FundingAgency,
  type ScholarshipType,
  type UserLevel,
} from "../identity/person-data-rules";
import { canActorManageProjectDecision } from "../project/project-rules";

export type AttestationMonth = string; // "AAAA-MM" validado

export interface AttestationActivityRow {
  description: string;
  firstMonth: string;
  lastMonth: string;
  status: string;
}

export interface AttestationSessionLogRow {
  activity: string | null;
  note: string | null;
  endTime: string;
}

/** Fallback determinístico: deduplica e limita o tamanho, sem concatenar todo o diário. */
export function summarizeAttestationSessionLogs(rows: AttestationSessionLogRow[]): string | null {
  const statements = [...new Set(rows.map((row) => {
    const note = row.note?.trim();
    const activity = row.activity?.trim();
    const usefulNote = note && !note.startsWith("Sessão de trabalho finalizada") ? note : null;
    if (activity && usefulNote && !usefulNote.includes(activity)) return `${activity}: ${usefulNote}`;
    return usefulNote ?? activity ?? "Sessão de trabalho registrada";
  }))];
  if (statements.length === 0) return null;
  const summary = statements.slice(0, 4).join("; ");
  return summary.length <= 220 ? summary : `${summary.slice(0, 217).trimEnd()}…`;
}

export interface AttestationFieldInput {
  project: { name: string; editalNumber: string | null; proppiNumber: string | null };
  member: {
    name: string;
    cpf: string | null;
    registrationNumber: string | null;
    level: string | null;
    scholarshipType: string | null;
    fundingAgency: string | null;
    fundingAgencyOther: string | null;
  };
  membership: { categoria: string | null; cargaHoraria: number | null };
  /** Atividades do cronograma que cruzam o mês de referência, na ordem da grade. */
  activities: AttestationActivityRow[];
  /** Síntese factual das sessões concluídas do membro no mês, sem task obrigatória. */
  sessionSummary?: string | null;
  month: AttestationMonth;
  /** Data civil da geração já decomposta (DEC-132). */
  now: { dia: string; mes: string; ano: string };
}

/** Campos preenchíveis sem valor; campos institucionais estáticos ficam fora do aviso. */
export function missingAttestationFieldLabels(input: AttestationFieldInput): string[] {
  const missing: string[] = [];
  const check = (value: unknown, label: string) => {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) missing.push(label);
  };
  check(input.project.name, "Título do projeto");
  check(input.project.editalNumber ?? input.project.proppiNumber, "Edital/PROPPI");
  check(input.member.name, "Nome do estudante");
  check(formatCpfForDocument(input.member.cpf), "CPF");
  check(input.member.registrationNumber, "Matrícula");
  check(input.member.level, "Nível de ensino");
  check(input.membership.cargaHoraria, "Carga horária");
  check(input.membership.categoria, "Categoria do vínculo");
  check(input.member.scholarshipType, "Modalidade");
  check(input.member.fundingAgency, "Agência financiadora");
  if (input.member.fundingAgency === "OUTRA") check(input.member.fundingAgencyOther, "Outra agência financiadora");
  if (!input.activities.some((activity) => activity.firstMonth <= input.month && activity.lastMonth >= input.month)) {
    missing.push("Atividades do cronograma no mês");
  }
  if (!input.sessionSummary) missing.push("Síntese dos logs de sessão no mês");
  return missing;
}

/** Nome dos campos conforme medido no oficial (DEC-130, guarda de inventário). */
const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

const SCHOLARSHIP_CHECKBOX: Record<ScholarshipType, string | null> = {
  PIBIC: "is_pibic",
  PIBIC_JR: "is_pibic-jr",
  PIBIC_AF: "is_pibic-af",
  PIBITI: "is_pibiti",
  PIBITI_JR: "is_pibiti-jr",
  BTP: "is_btp",
  MESTRADO: "is_mestrado",
  DOUTORADO: "is_doutorado",
  POS_DOC: "is_pos-doc",
  // Medido na folha: a linha de modalidade NÃO tem "Voluntário" — voluntário é
  // caracterização (`is_voluntario`), não modalidade.
  VOLUNTARIO: null,
};

const LEVEL_CHECKBOX: Record<UserLevel, string> = {
  MEDIO: "nivel_medio",
  GRADUACAO: "nivel_graduacao",
  POS_GRADUACAO: "nivel_pos-graduacao",
};

const FUNDING_CHECKBOX: Record<FundingAgency, string> = {
  CNPQ: "is_cnpq",
  FAPEMIG: "is_fapemig",
  OUTRA: "is_outra",
};

export function normalizeAttestationMonth(value: unknown): AttestationMonth {
  if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return value;
  }
  throw new ValidationError("Mês de referência do atestado é inválido (use AAAA-MM)");
}

export function monthNameLong(month: AttestationMonth): string {
  return MONTHS_LONG[Number(month.slice(5, 7)) - 1];
}

/** O mês anterior ao de uma data civil (`YYYY-MM-DD`) — mês em curso não pode ser atestado como integral. */
export function previousMonth(civilDay: string): AttestationMonth {
  const year = Number(civilDay.slice(0, 4));
  const month = Number(civilDay.slice(5, 7));
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function formatCpfForDocument(cpf: string | null): string | null {
  if (!cpf || cpf.length !== 11) return null;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
}

export type ProjectScheduleStatus =
  | "nao-iniciado"
  | "atrasado"
  | "como-previsto"
  | "adiantado"
  | "concluido";

/**
 * "SITUAÇÃO ATUAL DO PROJETO" no mês de referência, derivada do cronograma (plan V5-10):
 * planejada = começou até o mês (firstMonth <= mês); DONE = concluída.
 * Sem linhas → nao-iniciado; tudo DONE → concluido; planejada aberta → atrasado;
 * tudo do plano DONE e algo de mês FUTURO já DONE → adiantado; senão → como-previsto.
 */
export function projectScheduleStatus(
  activities: AttestationActivityRow[],
  month: AttestationMonth,
): ProjectScheduleStatus {
  if (activities.length === 0) return "nao-iniciado";
  const done = activities.filter((activity) => activity.status === "DONE");
  if (done.length === activities.length) return "concluido";
  const planned = activities.filter((activity) => activity.firstMonth <= month);
  const plannedOpen = planned.some((activity) => activity.status !== "DONE");
  if (plannedOpen) return "atrasado";
  const ahead = done.some((activity) => activity.firstMonth > month);
  if (ahead) return "adiantado";
  return "como-previsto";
}

const STATUS_CHECKBOX: Record<ProjectScheduleStatus, string> = {
  "nao-iniciado": "status_nao-iniciado",
  atrasado: "status_atrasado",
  "como-previsto": "status_como-previsto",
  adiantado: "status_adiantado",
  concluido: "status_concluido",
};

/**
 * Gate do atestado (DEC-171), mesma forma medida do gate do relatório técnico (DEC-139):
 * o líder entra explícito (ele pode ser líder sem membership de gestor) e o resto é a ACL
 * congelada de `canActorManageProjectDecision` — membership vence; sem membership, o global
 * MANAGE_USERS. A PRÓPRIA pessoa não passa por aqui: o use case trata `actorId === userId`
 * antes, porque o atestado é o documento do estudante.
 */
export function canActorManageCertificateDecision(
  actorId: number,
  actorUserRoles: string[] | null,
  leaderId: number | null,
  membershipRoles: string[] | null,
): boolean {
  if (leaderId !== null && actorId === leaderId) return true;
  return canActorManageProjectDecision(membershipRoles, actorUserRoles);
}

export function certificateBlobKey(projectId: number, userId: number, month: AttestationMonth): string {
  return `projects/${projectId}/certificates/${userId}/${month}.pdf`;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function certificateFileName(projectName: string, month: AttestationMonth): string {
  return `atestado-${month}-${slug(projectName)}.pdf`;
}

/**
 * O preenchimento dos 42 campos (DEC-130): texto → string, checkbox → true; campo sem valor
 * fica AUSENTE (o adaptador não escreve nada nele). `se_bolsista`, `coorientador`, `is_ifnmg`
 * e `justificativa` não têm fonte no sistema e ficam de fora — o oficial tem ORIENTADOR e
 * CAMPUS como texto ESTÁTICO do asset (medido), e o sistema nunca escreve texto estático
 * (regra 14 do plano).
 */
export function buildAttestationFields(input: AttestationFieldInput): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {};

  // INFORMAÇÕES DO PROJETO
  fields.titulo = input.project.name;
  const edital = input.project.editalNumber ?? input.project.proppiNumber;
  if (edital) fields.edital = edital;

  // DADOS DO(A) ESTUDANTE
  fields.nome = input.member.name;
  const cpf = formatCpfForDocument(input.member.cpf);
  if (cpf) fields.CPF = cpf;
  if (input.member.registrationNumber) fields.matricula = input.member.registrationNumber;

  // NÍVEL
  if (input.member.level && (USER_LEVELS as readonly string[]).includes(input.member.level)) {
    fields[LEVEL_CHECKBOX[input.member.level as UserLevel]] = true;
  }

  // CARGA HORÁRIA (semanal) — DEC-140: é a carga contratada do vínculo, não horas registradas
  if (input.membership.cargaHoraria === 8) fields.carga_8 = true;
  else if (input.membership.cargaHoraria === 20) fields.carga_20 = true;
  else if (input.membership.cargaHoraria !== null) {
    fields.carga_adaptada = true;
    fields.horas_adaptada = String(input.membership.cargaHoraria);
  }

  // CARACTERIZAÇÃO
  if (input.membership.categoria === "BOLSISTA") fields.is_bolsista = true;
  if (input.membership.categoria === "VOLUNTARIO") fields.is_voluntario = true;

  // MODALIDADE (a folha não tem "Voluntário" aqui — medido)
  if (input.member.scholarshipType && (SCHOLARSHIP_TYPES as readonly string[]).includes(input.member.scholarshipType)) {
    const checkbox = SCHOLARSHIP_CHECKBOX[input.member.scholarshipType as ScholarshipType];
    if (checkbox) fields[checkbox] = true;
    else if (input.member.scholarshipType === "VOLUNTARIO") fields.is_voluntario = true;
  }

  // AGÊNCIA FINANCIADORA
  if (input.member.fundingAgency && (FUNDING_AGENCIES as readonly string[]).includes(input.member.fundingAgency)) {
    fields[FUNDING_CHECKBOX[input.member.fundingAgency as FundingAgency]] = true;
    if (input.member.fundingAgency === "OUTRA" && input.member.fundingAgencyOther) {
      fields.agencia_outra = input.member.fundingAgencyOther;
    }
  }

  // DESCRIÇÃO SUCINTA DAS ATIVIDADES — as duas primeiras que cruzam o mês, na ordem
  const overlapping = input.activities.filter(
    (activity) => activity.firstMonth <= input.month && activity.lastMonth >= input.month,
  );
  if (overlapping[0]) fields.atividades_1 = overlapping[0].description;
  // O segundo campo é a síntese dos logs. Não concatenar atividades do cronograma aqui:
  // isso duplica conteúdo e estoura a área do formulário.
  const secondActivity = input.sessionSummary?.trim();
  if (secondActivity) fields.atividade_2 = secondActivity;

  // SITUAÇÃO ATUAL DO PROJETO
  fields[STATUS_CHECKBOX[projectScheduleStatus(input.activities, input.month)]] = true;

  // Corpo: "durante o mês de ____" — o mês de referência por extenso
  fields.data = monthNameLong(input.month);

  // Assinatura: "Januária, __ de ______ de ____." — a data civil da geração
  fields.dia = input.now.dia;
  fields.mes = input.now.mes;
  fields.ano = input.now.ano;

  return fields;
}

/**
 * Lembrete mensal de frequência (V5-10b, DEC-72). O job do cron dispara só no dia 19; a
 * audiência é COORDENADORES/GERENTES ATIVOS + LÍDERES de projeto (DEC-55: suspenso não
 * recebe). O mês nomeado na mensagem é o ANTERIOR ao da geração (DEC-171) — o mês que o
 * atestado pode atestar como integral.
 */
export const CERTIFICATE_REMINDER_NOTIFICATION_TYPE = "CERTIFICATE_REMINDER";
export const CERTIFICATE_REMINDER_TITLE = "Atestados de frequência";

export function certificateReminderMessage(projectName: string, referenceMonth: AttestationMonth): string {
  return `O atestado de frequência de ${monthNameLong(referenceMonth)} já pode ser gerado para o projeto "${projectName}".`;
}

/** Líder primeiro, depois os gestores globais; dedupe — mesmo desenho do atraso (DEC-64). */
export function certificateReminderRecipients(
  leaderId: number | null,
  globalManagerIds: number[],
): number[] {
  const ids = [leaderId, ...globalManagerIds].filter(
    (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
  );
  return [...new Set(ids)];
}
