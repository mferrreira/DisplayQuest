/**
 * Member-data rules — regra pura do vínculo usuário×projeto (V5-4b, DEC-69/DEC-140/DEC-149).
 *
 * O vínculo já existia (`project_members`: projectId, userId, joinedAt, roles UserRole[], único
 * por par). Estas colunas são o que falta para ele dizer o que o vínculo É, não só quem participa:
 *
 *   `lattes`       identificador do pesquisador (não tem campo nos dois formulários; é dado do
 *                  quadro de equipe)
 *   `cargaHoraria` a carga CONTRATADA, que alimenta o atestado (`carga_8` / `carga_20` /
 *                  `carga_adaptada` + `horas_adaptada`). NÃO é `users.weekHours`, a meta semanal da
 *                  pessoa usada nos relatórios semanais — os dois coexistem (DEC-140)
 *   `categoria`    lista fechada derivada dos dois checkboxes medidos do AcroForm: `is_bolsista`
 *                  e `is_voluntario` (DEC-149). Nula quando não declarada. Não confunde com
 *                  `roles`: papel é ACL do vínculo, categoria é o que o documento assinala
 *   `situacao`     `ATIVO | INATIVO`, nunca nula (DEC-149). Não é o caminho de sair do projeto —
 *                  sair apaga a linha (`RemoveProjectMemberUseCase`), e as horas ficam em
 *                  `work_sessions`
 *   `dataEntrada`  data civil `YYYY-MM-DD` (DEC-132), o dia de calendário que a pessoa entrou;
 *                  `joinedAt` continua sendo o instantâneo em que a linha nasceu
 *
 * Como no V5-4a, o rótulo que a interface mostra mora ao lado do token (lição da DEC-96), e a
 * normalização aceita a grafia de tela sem acento. A regra de lista fechada é a MESMA peça do
 * agregado de identidade (`normalizePersonEnum`) — duplicar a dobra de acento seria a regra em
 * duas cópias (DEC-90/134).
 */
import { ValidationError } from "../errors";
import { normalizePersonEnum } from "../identity";
import { civilDayOfDate } from "../time/civil-day";

export const MEMBER_CATEGORIES = ["BOLSISTA", "VOLUNTARIO"] as const;
export type MemberCategory = (typeof MEMBER_CATEGORIES)[number];

export const MEMBER_SITUATIONS = ["ATIVO", "INATIVO"] as const;
export type MemberSituation = (typeof MEMBER_SITUATIONS)[number];

/** Rótulos da interface. O valor enviado continua sendo o token. */
export const MEMBER_CATEGORY_LABELS: Record<MemberCategory, string> = {
  BOLSISTA: "Bolsista",
  VOLUNTARIO: "Voluntário",
};

export const MEMBER_SITUATION_LABELS: Record<MemberSituation, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
};

/** A coluna nasce com situação (DEC-149): `situacao` não é nula em nenhum estado do mundo. */
export const DEFAULT_MEMBER_SITUATION: MemberSituation = "ATIVO";

/**
 * Tetos. O do Lattes é o mesmo critério dos campos de pessoa (DEC-147): o formulário oficial tem
 * a linha do tamanho. O da carga é um teto físico (168 h = uma semana), não política de edital:
 * acima disso o valor é erro de digitação, e o atestado imprimiria uma carga absurda.
 */
export const MEMBER_LATTES_MAX_LENGTH = 120;
export const MEMBER_CARGO_MAX_HOURS = 168;

export const MEMBER_CATEGORY_MESSAGE = "Categoria de membro inválida";
export const MEMBER_SITUATION_MESSAGE = "Situação de membro inválida";
export const MEMBER_CARGO_MESSAGE =
  "Carga horária do membro deve ser um número maior que 0 e no máximo 168 horas semanais";
export const MEMBER_LATTES_MESSAGE = `Currículo Lattes do membro deve ter no máximo ${MEMBER_LATTES_MAX_LENGTH} caracteres`;
export const MEMBER_ENTRY_DATE_MESSAGE = "Data de entrada do membro é inválida (use AAAA-MM-DD)";

export function normalizeMemberCategory(value: unknown): MemberCategory | null {
  return normalizePersonEnum(value, MEMBER_CATEGORIES, MEMBER_CATEGORY_MESSAGE) as
    | MemberCategory
    | null;
}

/**
 * Ausente, null e string vazia viram ATIVO: a coluna não tem estado "sem situação". Já um valor
 * escrito errado é recusado nomeando o campo — "Inativo" grafado "inactiva" não pode virar
 * `ATIVO` por tolerância, porque o sentido é oposto.
 */
export function normalizeMemberSituation(value: unknown): MemberSituation {
  if (value === null || value === undefined || String(value).trim() === "") {
    return DEFAULT_MEMBER_SITUATION;
  }
  return normalizePersonEnum(value, MEMBER_SITUATIONS, MEMBER_SITUATION_MESSAGE) as MemberSituation;
}

export function normalizeMemberLattes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > MEMBER_LATTES_MAX_LENGTH) throw new ValidationError(MEMBER_LATTES_MESSAGE);
  return text;
}

/**
 * Carga contratada. `null` é "não declarada" (o atestado então não assinala carga). Fracionário é
 * legítimo (7,5 h existe) e é arredondado a centésimos, que é a precisão que o documento imprime.
 */
export function normalizeMemberCargaHoraria(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MEMBER_CARGO_MAX_HOURS) {
    throw new ValidationError(MEMBER_CARGO_MESSAGE);
  }
  return Math.round(hours * 100) / 100;
}

/**
 * Data civil, pela mesma aritmética do projeto (DEC-132): `2026-02-01` é 1º de fevereiro, e o ISO
 * que o `<input type="date">` devolve é lido como o dia do laboratório, não como meia-noite UTC.
 *
 * Aqui a forma é exigida, e o motivo foi medido escrevendo este teste: `civilDayOfDate` aceita o
 * que `new Date()` aceita, e `new Date("01/02/2026")` é **2 de janeiro** (leitura dos EUA). Deixar
 * isso passar seria a data mentir em silêncio — exatamente o erro que a DEC-132 fechou. O caminho
 * do projeto (`normalizeProjectDateField`) mantém o comportamento congelado no V5-2b; a divergência
 * está registrada na DEC-149 porque hoje nenhuma tela produz esse formato.
 */
const CIVIL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T/;

export function normalizeMemberEntryDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (!CIVIL_DAY_PATTERN.test(raw) && !ISO_INSTANT_PATTERN.test(raw)) {
    throw new ValidationError(MEMBER_ENTRY_DATE_MESSAGE);
  }

  const day = civilDayOfDate(raw);
  if (day === null) throw new ValidationError(MEMBER_ENTRY_DATE_MESSAGE);
  return day;
}

export interface MemberProfileFields {
  lattes: string | null;
  cargaHoraria: number | null;
  categoria: MemberCategory | null;
  situacao: MemberSituation;
  dataEntrada: string | null;
}

/** Vínculo recém-criado: sem dado de vínculo, com situação. */
export function emptyMemberProfile(): MemberProfileFields {
  return {
    lattes: null,
    cargaHoraria: null,
    categoria: null,
    situacao: DEFAULT_MEMBER_SITUATION,
    dataEntrada: null,
  };
}

/**
 * Aplica os campos do vínculo sobre um registro, normalizando cada um. Só escreve o que veio no
 * corpo: chave ausente não apaga dado (mesma trava dos campos de pessoa, DEC-138).
 */
export function applyMemberProfileFields<T extends MemberProfileFields>(
  target: T,
  data: Record<string, unknown>,
): T {
  if (data.lattes !== undefined) target.lattes = normalizeMemberLattes(data.lattes);
  if (data.cargaHoraria !== undefined) target.cargaHoraria = normalizeMemberCargaHoraria(data.cargaHoraria);
  if (data.categoria !== undefined) target.categoria = normalizeMemberCategory(data.categoria);
  if (data.situacao !== undefined) target.situacao = normalizeMemberSituation(data.situacao);
  if (data.dataEntrada !== undefined) target.dataEntrada = normalizeMemberEntryDate(data.dataEntrada);
  return target;
}
