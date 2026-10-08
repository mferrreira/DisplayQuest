import { ForbiddenError, type ActorRef } from "@/backend/domain";

/**
 * Guarda de wiring (B6-7, DEC-123): as operacoes de tarefa migradas no D4 tem PESSOA atras —
 * nenhuma rotina de sistema as chama (o cron nao toca tarefas). Um systemActor aqui e erro de
 * wiring, e a mensagem NAO e contrato congelado (mesma classe do requireSessionActor do B6-5).
 */
export function requireTaskPersonActor(
  actor: ActorRef,
  message = "Ação de tarefa exige ator pessoa",
): Extract<ActorRef, { kind: "user" }> {
  if (actor.kind !== "user") throw new ForbiddenError(message)
  return actor
}
