/**
 * Regras puras do relatório técnico (V5-9, DEC-70/139/167).
 *
 * O par é projeto × tipo (DEC-70: "um registro editável por par") e o tipo é lista
 * fechada de três valores. A leitura é a do autenticado — filho de projeto, herda a
 * leitura aberta (regra 13 do plano, DEC-127/136); a escrita obedece ao par medido
 * "gestão/líder" (DEC-139): o líder entra explícito (ele pode ser líder sem membership
 * de gestor) e o resto é a ACL congelada de `canActorManageProjectDecision` — membership
 * vence; sem membership, o global MANAGE_USERS.
 *
 * A linha de checkbox do DOCX é binária (medido no oficial, 2026-10-14):
 * "( ) Relatório Final (  ) Relatório Parcial" é um único run de Times New Roman 12
 * negrito. Não existe terceira caixa: `tecnico-final` e `final` marcam Final — o nome
 * carrega "final" (DEC-167).
 */
import { ValidationError } from "../errors";
import { canActorManageProjectDecision } from "../project/project-rules";

/** Os três tipos do dono (DEC-70). `tecnico-final` é o nome do relatório técnico final. */
export const TECHNICAL_REPORT_TYPES = ["parcial", "tecnico-final", "final"] as const;

export type TechnicalReportType = (typeof TECHNICAL_REPORT_TYPES)[number];

export function isTechnicalReportType(value: unknown): value is TechnicalReportType {
  return typeof value === "string" && (TECHNICAL_REPORT_TYPES as readonly string[]).includes(value);
}

/**
 * A frase do tipo inválido mora no domínio: os dois use cases do relatório técnico
 * (upsert e geração) recusam com a MESMA mensagem — construí-la em cada use case seria
 * a regra em duas cópias (lição DEC-95/96).
 */
export function invalidTechnicalReportTypeError(): ValidationError {
  const allowed = TECHNICAL_REPORT_TYPES.map((t) => `"${t}"`);
  return new ValidationError(
    `Tipo de relatório técnico inválido: use ${allowed.slice(0, -1).join(", ")} ou ${allowed[allowed.length - 1]}`,
  );
}

/**
 * Gate de escrita (DEC-139 "gestão/líder"): líder OU ACL do projeto. Não é o gate de
 * PEDIR conclusão (líder OU membership de gestor, DEC-76): aqui o global sem membership
 * que gerencia a grade também edita, porque a gestão do relatório é a gestão do projeto.
 */
export function canActorManageTechnicalReportDecision(
  actorId: number,
  actorUserRoles: string[] | null,
  leaderId: number | null,
  membershipRoles: string[] | null,
): boolean {
  if (leaderId !== null && actorId === leaderId) return true;
  return canActorManageProjectDecision(membershipRoles, actorUserRoles);
}

/** Qual caixa da linha "( ) Relatório Final ( ) Relatório Parcial" o tipo marca. */
export function technicalReportCheckbox(type: TechnicalReportType): "final" | "parcial" {
  return type === "parcial" ? "parcial" : "final";
}
