/**
 * Person-data rules — regra pura do agregado de identidade (V5-4a, DEC-138/DEC-140).
 *
 * Os campos existem porque os dois formulários oficiais os pedem: o atestado (AcroForm) e o
 * relatório técnico (DOCX). As listas fechadas não são inventadas — saem dos nomes de campo
 * medidos no AcroForm em 2026-10-13 e congelados em
 * `tests/unit/scripts/report-templates-drift.test.ts`:
 *
 *   nível      `nivel_medio`, `nivel_graduacao`, `nivel_pos-graduacao`
 *   modalidade `is_pibic`, `is_pibic-jr`, `is_pibic-af`, `is_pibiti`, `is_pibiti-jr`, `is_btp`,
 *              `is_mestrado`, `is_doutorado`, `is_pos-doc`, `is_voluntario`
 *   fomento    `is_cnpq`, `is_fapemig`, `is_outra` + o texto livre `agencia_outra`
 *
 * O token guardado em `users` é o que o V5-10 traduz em checkbox, sem segunda tradução no meio
 * do caminho. A lista de exibição (o rótulo que a interface mostra) mora aqui do lado do token
 * pela mesma razão da lição do DEC-96: vocabulário de tela inventado em componente diverge do
 * vocabulário que o servidor escreve.
 *
 * Escrita: o próprio OU quem gerencia contas (o gate do perfil, DEC-138). Leitura: `cpf` é o
 * único com leitura restrita; curso, matrícula, modalidade, fomento e nível seguem a leitura
 * aberta do perfil.
 */
import { ValidationError } from "../errors";
import type { ActorRef } from "./actor-ref";
import { hasPermission } from "./has-permission";

export const USER_LEVELS = ["MEDIO", "GRADUACAO", "POS_GRADUACAO"] as const;
export type UserLevel = (typeof USER_LEVELS)[number];

export const SCHOLARSHIP_TYPES = [
  "PIBIC",
  "PIBIC_JR",
  "PIBIC_AF",
  "PIBITI",
  "PIBITI_JR",
  "BTP",
  "MESTRADO",
  "DOUTORADO",
  "POS_DOC",
  "VOLUNTARIO",
] as const;
export type ScholarshipType = (typeof SCHOLARSHIP_TYPES)[number];

export const FUNDING_AGENCIES = ["CNPQ", "FAPEMIG", "OUTRA"] as const;
export type FundingAgency = (typeof FUNDING_AGENCIES)[number];

/** Rótulos da interface. O valor enviado continua sendo o token. */
export const USER_LEVEL_LABELS: Record<UserLevel, string> = {
  MEDIO: "Médio",
  GRADUACAO: "Graduação",
  POS_GRADUACAO: "Pós-graduação",
};

export const SCHOLARSHIP_TYPE_LABELS: Record<ScholarshipType, string> = {
  PIBIC: "PIBIC",
  PIBIC_JR: "PIBIC Jr",
  PIBIC_AF: "PIBIC Af",
  PIBITI: "PIBITI",
  PIBITI_JR: "PIBITI Jr",
  BTP: "BTP",
  MESTRADO: "Mestrado",
  DOUTORADO: "Doutorado",
  POS_DOC: "Pós-doc",
  VOLUNTARIO: "Voluntário",
};

export const FUNDING_AGENCY_LABELS: Record<FundingAgency, string> = {
  CNPQ: "CNPq",
  FAPEMIG: "Fapemig",
  OUTRA: "Outra",
};

/**
 * Tetos de texto. Não são estética: o formulário oficial tem a linha do tamanho, e um valor
 * maior que a linha não sai no documento entregue.
 */
export const PERSON_TEXT_LIMITS = {
  registrationNumber: { label: "Matrícula", max: 40 },
  course: { label: "Curso", max: 120 },
  fundingAgencyOther: { label: "Instituição de fomento", max: 80 },
} as const;

export type PersonTextField = keyof typeof PERSON_TEXT_LIMITS;

/** Ausente, null e string vazia viram null: "sem dado" é uma coluna nula, não uma string vazia. */
export function normalizePersonText(
  field: PersonTextField,
  value: unknown,
): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  const { label, max } = PERSON_TEXT_LIMITS[field];
  if (text.length > max) {
    throw new ValidationError(`${label} deve ter no máximo ${max} caracteres`);
  }
  return text;
}

/**
 * Lista fechada, recusando o que não está nela. A normalização aceita a grafia de tela
 * ("PIBIC Jr", "Pós-graduação") e devolve o token: o rótulo que a interface mostra e o valor
 * que o servidor escreve vêm da mesma mesa, e acento não é motivo de 400. Valor desconhecido
 * continua sendo erro de escrita, não valor ignorado: modalidade escrita errada muda o checkbox
 * do atestado.
 */
export function normalizePersonEnum(
  value: unknown,
  allowed: readonly string[],
  message: string,
): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const token = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!allowed.includes(token)) {
    throw new ValidationError(message);
  }
  return token;
}

export function normalizeUserLevel(value: unknown): UserLevel | null {
  return normalizePersonEnum(value, USER_LEVELS, "Nível inválido") as UserLevel | null;
}

export function normalizeScholarshipType(value: unknown): ScholarshipType | null {
  return normalizePersonEnum(
    value,
    SCHOLARSHIP_TYPES,
    "Modalidade de IC inválida",
  ) as ScholarshipType | null;
}

export function normalizeFundingAgency(value: unknown): FundingAgency | null {
  return normalizePersonEnum(
    value,
    FUNDING_AGENCIES,
    "Instituição de fomento inválida",
  ) as FundingAgency | null;
}

/**
 * CPF: 11 dígitos com os dois dígitos verificadores conferidos (algoritmo oficial). Guarda só
 * os dígitos. Recusar aqui é o que impede "123" de sair preenchido no atestado.
 *
 * O caso degenerado (11 dígitos iguais) passa na aritmética dos verificadores e não é CPF:
 * 11111111111 é o valor que o formulário web preenche no automático.
 */
export function normalizeCpf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) throw new ValidationError("CPF inválido");
  if (new Set(digits).size === 1) throw new ValidationError("CPF inválido");

  const numbers = digits.split("").map(Number);
  const checkDigit = (count: number): number => {
    const sum = numbers
      .slice(0, count)
      .reduce((acc, digit, index) => acc + digit * (count + 1 - index), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  if (checkDigit(9) !== numbers[9] || checkDigit(10) !== numbers[10]) {
    throw new ValidationError("CPF inválido");
  }
  return digits;
}

/** Máscara de exibição. O banco guarda os dígitos; a tela mostra `123.456.789-01`. */
export function maskCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Quem lê o CPF (DEC-138): a própria pessoa e quem gerencia contas. O ator de sistema entra
 * porque a geração do atestado (V5-10) é rotina sem pessoa atrás dela, e o documento precisa
 * do campo — o mesmo desenho do DEC-54.
 */
export function canActorReadUserCpf(actor: ActorRef, targetUserId: number): boolean {
  if (actor.kind === "system") return true;
  return actor.id === targetUserId || hasPermission(actor.roles, "MANAGE_USERS");
}

/** Os sete campos, na forma que o record do módulo carrega. */
export interface PersonDataFields {
  cpf: string | null;
  registrationNumber: string | null;
  course: string | null;
  scholarshipType: string | null;
  fundingAgency: string | null;
  fundingAgencyOther: string | null;
  level: string | null;
}

/**
 * Registro recém-criado não tem dado de pessoa. Existe para os dois caminhos de criação (painel
 * e cadastro) não escreverem sete `null` cada um e divergirem depois.
 */
export function emptyPersonData(): PersonDataFields {
  return {
    cpf: null,
    registrationNumber: null,
    course: null,
    scholarshipType: null,
    fundingAgency: null,
    fundingAgencyOther: null,
    level: null,
  };
}

/**
 * Aplica os campos de pessoa sobre um registro, normalizando cada um. Só escreve o que veio no
 * corpo: chave ausente não apaga dado.
 *
 * Os dois caminhos de escrita (PUT do painel e PATCH do perfil) passam por aqui, para a
 * normalização não existir em duas cópias — a mesma razão que tirou `subtaskWindowMessage` do
 * view interno no DEC-90.
 *
 * Trava medida no formulário: `agencia_outra` só tem sentido com `is_outra`. Escolher CNPq ou
 * Fapemig apaga o texto livre, senão o V5-10 imprimaria uma agência que a pessoa não marcou.
 */
export function applyPersonDataFields<T extends PersonDataFields>(
  target: T,
  data: Record<string, unknown>,
): T {
  if (data.cpf !== undefined) target.cpf = normalizeCpf(data.cpf);
  if (data.registrationNumber !== undefined) {
    target.registrationNumber = normalizePersonText("registrationNumber", data.registrationNumber);
  }
  if (data.course !== undefined) target.course = normalizePersonText("course", data.course);
  if (data.scholarshipType !== undefined) {
    target.scholarshipType = normalizeScholarshipType(data.scholarshipType);
  }
  if (data.fundingAgency !== undefined) {
    target.fundingAgency = normalizeFundingAgency(data.fundingAgency);
  }
  if (data.fundingAgency !== undefined && target.fundingAgency !== "OUTRA") {
    target.fundingAgencyOther = null;
  }
  if (data.fundingAgencyOther !== undefined) {
    target.fundingAgencyOther = normalizePersonText("fundingAgencyOther", data.fundingAgencyOther);
  }
  if (data.level !== undefined) target.level = normalizeUserLevel(data.level);
  return target;
}
