/**
 * V5-2c (DEC-61/63) — regras puras de entregável e anexo do projeto.
 *
 * Separação deliberada, medida na casa: o **tipo** de arquivo e os **magic bytes** são do
 * seam `lib/storage/blob-store.ts` (DEC-101), e é lá que a allowlist mora. Aqui ficam só o
 * nome e o tamanho do metadado, porque são a regra do registro, não do objeto. Repetir a
 * checagem de mime nos dois lados é a receita de as duas divergirem (lição DEC-90).
 */

// ---------------------------------------------------------------------------
// Entregável (project_deliverables): (nome, quantidade)
// ---------------------------------------------------------------------------

/** Mesmo teto do nome de projeto (`validateProjectInput`). */
export const DELIVERABLE_NAME_MAX_LENGTH = 100;
/** Teto arbitrário de bom senso: entregável é contagem de entrega, não estoque. */
export const DELIVERABLE_MAX_QUANTITY = 999;
/** "Não informei quantidade" é 1, não 0 e não erro. */
export const DELIVERABLE_DEFAULT_QUANTITY = 1;

export interface DeliverableInputLike {
  name?: unknown;
  quantity?: unknown;
}

export interface DeliverableFields {
  name: string;
  quantity: number;
}

/**
 * Normaliza a entrada do formulário. Quantidade sem leitura vira `NaN` de propósito: o
 * default 1 é para "ausente", e "informei lixo" tem que chegar na validação nomeando o
 * campo, em vez de virar 1 em silêncio.
 */
export function normalizeDeliverableInput(input: DeliverableInputLike): DeliverableFields {
  const name = (input.name ?? "").toString().trim();

  let quantity: number = DELIVERABLE_DEFAULT_QUANTITY;
  if (input.quantity !== null && input.quantity !== undefined && input.quantity !== "") {
    const parsed = Number(input.quantity);
    quantity = Number.isFinite(parsed) ? Math.trunc(parsed) : Number.NaN;
  }

  return { name, quantity };
}

export function validateDeliverableInput(fields: DeliverableFields | DeliverableInputLike): string[] {
  const errors: string[] = [];
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const quantity = fields.quantity;

  if (name === "") {
    errors.push("Nome do entregável é obrigatório");
  } else if (name.length > DELIVERABLE_NAME_MAX_LENGTH) {
    errors.push(`Nome do entregável não pode ter mais de ${DELIVERABLE_NAME_MAX_LENGTH} caracteres`);
  }

  if (!Number.isInteger(quantity) || (quantity as number) < 1) {
    errors.push("Quantidade do entregável deve ser um inteiro maior que zero");
  } else if ((quantity as number) > DELIVERABLE_MAX_QUANTITY) {
    errors.push(`Quantidade do entregável não pode passar de ${DELIVERABLE_MAX_QUANTITY}`);
  }

  return errors;
}

export function deliverableValidationMessage(errors: string[]): string {
  return `Dados inválidos: ${errors.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Anexo (project_attachments): prefixo da chave + metadado
// ---------------------------------------------------------------------------

/** Mesmo teto do nome de arquivo exibido nos anexos de relatório (`sanitizeDisplayName`). */
export const ATTACHMENT_NAME_MAX_LENGTH = 255;

/**
 * Prefixo de chave do anexo no bucket: `projects/<id>/attachments`.
 *
 * O id é validado aqui porque o `sanitizeBlobPrefix` do seam só protege contra traversal —
 * ele aceitaria `projects/0/attachments` de bom grado. É o outro lado da mesma porta.
 */
export function projectAttachmentPrefix(projectId: number): string {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(`projeto inválido para montar prefixo de anexo: ${projectId}`);
  }
  return `projects/${projectId}/attachments`;
}

export interface ProjectAttachmentMetadata {
  name?: unknown;
  size?: unknown;
}

/** Nome e tamanho do registro. Tipo/magic bytes ficam no seam, como dito no cabeçalho. */
export function validateProjectAttachmentMetadata(metadata: ProjectAttachmentMetadata): string[] {
  const errors: string[] = [];
  const name = typeof metadata.name === "string" ? metadata.name.trim() : "";
  const size = Number(metadata.size);

  if (name === "") {
    errors.push("Nome do anexo é obrigatório");
  } else if (name.length > ATTACHMENT_NAME_MAX_LENGTH) {
    errors.push(`Nome do anexo não pode ter mais de ${ATTACHMENT_NAME_MAX_LENGTH} caracteres`);
  }

  if (!Number.isFinite(size) || size <= 0) {
    errors.push("Anexo sem conteúdo");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Imagem do projeto (projects.logoKey / bannerKey): slot e prefixo — V5-2d (DEC-102)
// ---------------------------------------------------------------------------

/**
 * Os dois slots de imagem que o projeto tem. Uma lista fechada porque o slot entra na CHAVE do
 * bucket: aceita-lo cru significaria `projects/7/images/<qualquer-coisa>` e a chave deixaria de
 * dizer o que é.
 */
export const PROJECT_IMAGE_SLOTS = ["logo", "banner"] as const;
export type ProjectImageSlot = (typeof PROJECT_IMAGE_SLOTS)[number];

export const PROJECT_IMAGE_SLOT_MESSAGE = "Slot de imagem deve ser logo ou banner";

export function isProjectImageSlot(value: unknown): value is ProjectImageSlot {
  return typeof value === "string" && (PROJECT_IMAGE_SLOTS as readonly string[]).includes(value);
}

/**
 * Prefixo de chave da imagem: `projects/<id>/images/<slot>`.
 *
 * O id é conferido aqui pelo mesmo motivo do anexo: o `sanitizeBlobPrefix` do seam só protege
 * contra traversal, e `projects/0/images/logo` é um caminho perfeitamente bem formado.
 */
export function projectImagePrefix(projectId: number, slot: ProjectImageSlot): string {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(`projeto inválido para montar prefixo de imagem: ${projectId}`);
  }
  return `projects/${projectId}/images/${slot}`;
}
