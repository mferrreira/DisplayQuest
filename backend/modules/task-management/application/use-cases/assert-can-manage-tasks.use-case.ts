import { requireActorPermission, type ActorRef } from "@/backend/domain";

/**
 * AssertCanManageTasksUseCase — B6-7 (D4), molde do AssertCanPublishNotificationEventUseCase
 * (B6-2b) e do AssertCanManageUserSchedulesUseCase (B6-6): o POST /api/tasks autoriza ANTES
 * de ler o corpo, porque na ordem medida os 400 de entrada ("Nenhuma task informada para
 * backlog", "projectId inválido" etc.) vem DEPOIS do 403 — sem este assert antes do parse,
 * quem não tem MANAGE_TASKS com corpo inválido passaria a receber 400. `createTask` recheca
 * no próprio ator para proteger os demais chamadores.
 */
export class AssertCanManageTasksUseCase {
  execute(command: { actor: ActorRef }): void {
    requireActorPermission(command.actor, "MANAGE_TASKS", "Sem permissão para criar tarefa")
  }
}
