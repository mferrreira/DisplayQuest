/**
 * B6-6 (D4) — regra de acesso às mutações de issue, medida nas 4 rotas /api/issues/*:
 *   - gerenciar (PUT/DELETE/status/resolve): MANAGE_USERS OU reporter OU assignee;
 *   - atribuir (assign): MANAGE_USERS OU reporter — o assignee NAO pode reatribuir (medido:
 *     a rota legado nao incluia assigneeId no gate de assign).
 * As mensagens 403 sao as congeladas por rota e chegam por parametro (mesma casa da
 * deniedMessage do ListProjectLogsForLeaderUseCase, DEC-121). System nao tem issue atras:
 * kind !== "user" nega (nenhuma rotina chama estas mutacoes).
 */
import { ForbiddenError } from "../errors";
import { hasPermission } from "../identity/has-permission";
import type { ActorRef } from "../identity/actor-ref";

export interface IssueOwnership {
  reporterId: number;
  assigneeId?: number | null;
}

export function canActorManageIssue(actor: ActorRef, issue: IssueOwnership): boolean {
  if (actor.kind !== "user") return false;
  if (hasPermission(actor.roles, "MANAGE_USERS")) return true;
  return issue.reporterId === actor.id || issue.assigneeId === actor.id;
}

export function canActorAssignIssue(actor: ActorRef, issue: IssueOwnership): boolean {
  if (actor.kind !== "user") return false;
  if (hasPermission(actor.roles, "MANAGE_USERS")) return true;
  return issue.reporterId === actor.id;
}

export function requireIssueManager(actor: ActorRef, issue: IssueOwnership, message: string): void {
  if (!canActorManageIssue(actor, issue)) throw new ForbiddenError(message);
}

export function requireIssueAssigner(actor: ActorRef, issue: IssueOwnership, message: string): void {
  if (!canActorAssignIssue(actor, issue)) throw new ForbiddenError(message);
}
