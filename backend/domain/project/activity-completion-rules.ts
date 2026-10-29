/**
 * Fluxo de conclusão de atividade — V5-7a (DEC-76/99/162).
 *
 * São as regras puras das duas fases: quem pode pedir, de que status se pede, o que a trava
 * DEC-99 diz quando ainda há tarefa pendente na etapa, e o que a exigência de prova (DEC-162)
 * diz quando não há arquivo. Nenhuma delas toca porta ou banco — quem lança erro tipado é o
 * use case; aqui só há decisão e frase.
 *
 * As frases vivem no domínio porque têm mais de um consumidor: a rota, o mock de teste
 * (`tests/mocks/handlers.ts`) e a tela que mostra o 400. Frase de regra escrita em dois
 * lugares é a receita da DEC-90 (mock que reimplementa a regra fica verde com a produção
 * mentindo).
 */

import { PROJECT_MANAGER_MEMBERSHIP_ROLES } from "./project-rules";
import type { ActivityStatus } from "./cronograma-rules";

/**
 * Gate de PEDIR a conclusão (DEC-76, literal): líder do projeto OU membro com papel de gestor
 * do projeto. Não é a ACL de gestão inteira do projeto — o global sem membership gerencia a
 * grade (quirk congelado da ACL) mas não pede a conclusão; ele é o lado que APROVA (DEC-76/77).
 */
export function canActorRequestActivityCompletionDecision(
  actorId: number,
  leaderId: number | null,
  membershipRoles: string[] | null,
): boolean {
  if (leaderId !== null && actorId === leaderId) return true;
  return Boolean(membershipRoles?.some((role) => PROJECT_MANAGER_MEMBERSHIP_ROLES.includes(role)));
}

/** De que status a fase de solicitar aceita partir (DEC-76: OPEN → COMPLETION_REQUESTED). */
export function isActivityRequestable(status: ActivityStatus): boolean {
  return status === "OPEN";
}

/**
 * A frase do 409 quando o estado do mundo já passou da fase. É 409 e não 400 porque o conflito
 * é o status atual, mesma gramática da janela de subtask (DEC-80).
 */
export function activityRequestConflictMessage(status: ActivityStatus): string {
  if (status === "COMPLETION_REQUESTED") {
    return "A conclusão desta atividade já foi solicitada";
  }
  return "Esta atividade já foi concluída";
}

/**
 * A frase da trava DEC-99: a atividade tem tasks como suas "subtasks" (DEC-99), e a lógica da
 * mãe (DEC-82) vale — solicitar conclusão com tarefa aberta é 400. O número entra na frase pela
 * mesma razão da DEC-57: dizer QUANTAS faltam. Singular escrito à parte para não sair
 * "as 1 tarefa restante".
 */
export function activityOpenTasksMessage(openCount: number): string {
  if (openCount === 1) return "Conclua a tarefa restante da atividade antes de solicitar a conclusão";
  return `Conclua as ${openCount} tarefas da atividade antes de solicitar a conclusão`;
}

/**
 * A frase da exigência de prova (DEC-162): solicitar sem nenhum arquivo anexado é 400 e a
 * atividade fica OPEN. Juízes consultados (Big Pickle, três unânimes): quem aprova é outra
 * pessoa, e sem artefato a aprovação vira carimbo — o rastro documental que a brochura exige.
 */
export const ACTIVITY_NO_PROOF_MESSAGE =
  "Anexe pelo menos uma prova antes de solicitar a conclusão";

/**
 * Notificação de solicitação de conclusão (fix 4, 2026-10-28). O pedido de conclusão é um
 * evento que a gestão precisa ver: a rota publica a notificação pelo mesmo caminho do atraso
 * (DEC-21/64), e quem aprova é a coordenação/gestão global. A fase de pedir não tem rota de
 * publicação própria: a notificação sai do use case, depois da escrita, com `systemActor`
 * (DEC-54) — a pessoa que pediu não publica, o sistema anuncia.
 *
 * Tipo no vocabulário de `notifications.type` (painel pinta por ele). Título único; a mensagem
 * carrega atividade e projeto. Audiência: coordenadores/gerentes ATIVOS — quem pediu não
 * recebe (o líder age, não é avisado de si mesmo), e a deduplicação é por id.
 */
export const ACTIVITY_COMPLETION_REQUEST_NOTIFICATION_TYPE = "ACTIVITY_COMPLETION_REQUEST";

export const ACTIVITY_COMPLETION_REQUEST_TITLE = "Conclusão de atividade solicitada";

export function activityCompletionRequestMessage(projectName: string, description: string): string {
  return (
    `A conclusão da atividade "${description}" do projeto "${projectName}" foi solicitada. ` +
    "Aprove a conclusão no cronograma do projeto."
  );
}

/**
 * Audiência da notificação de solicitação: só os papéis globais de gestão (coordenação/gerência
 * ATIVOS), deduplicada por id. O líder não entra — ele pediu, não é o avisado.
 */
export function completionRequestRecipients(globalManagerIds: number[]): number[] {
  return [
    ...new Set(
      globalManagerIds.filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}
