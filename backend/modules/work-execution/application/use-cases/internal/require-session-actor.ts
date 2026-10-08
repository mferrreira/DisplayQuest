import {
  ForbiddenError,
  requireActorSelfOrPermission,
  type ActorRef,
} from "@/backend/domain"

/**
 * requireSessionActor — o gate self-ou-gestao das mutações de sessão (B6-5, D4) em forma
 * tipada: `requireActorSelfOrPermission` com MANAGE_WORK_SESSIONS e a mensagem congelada de
 * cada use case ("Não autorizado a atualizar esta sessão" / "Não autorizado a excluir esta
 * sessão"), preservando o que a rota legado montava com `ensureSelfOrPermission`.
 *
 * Devolve o id da PESSOA. A checagem de pessoa depois do gate é guarda de wiring, não regra:
 * as três mutações têm lógica dependente de id (membro do projeto, tasks atribuídas ao ator),
 * e nenhuma rotina de sistema chama complete/update/delete — o cron só lista (NIGHTLY_SWEEP).
 * Um systemActor aqui é erro de wiring, e a mensagem nova não é contrato congelado.
 */
export function requireSessionActor(actor: ActorRef, ownerUserId: number, message: string): number {
  requireActorSelfOrPermission(actor, ownerUserId, "MANAGE_WORK_SESSIONS", message)

  if (actor.kind !== "user") {
    throw new ForbiddenError("Ação de sessão exige ator pessoa")
  }

  return actor.id
}
