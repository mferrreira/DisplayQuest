/**
 * V5-6 (DEC-99) — a ligação da tarefa com a linha do cronograma do projeto.
 *
 * A hierarquia pedida pelo dono é Atividade → Tasks → task_subtasks. A tarefa guarda só a chave
 * da linha; o projeto da atividade é o que decide se a ligação faz sentido. A FK do schema é
 * `SetNull` (apagar a etapa não apaga a tarefa, DEC-156), então a checagem de projeto não pode
 * ser da FK: a FK não sabe qual projeto a tarefa declara ter, e uma tarefa de outro projeto
 * ligada a esta atividade é erro de entrada, não de integridade.
 *
 * O que a regra NÃO faz: recusar atividade passada. "Só futuras + vigente" é regra do seletor
 * (DEC-99), medida na tela. Uma tarefa já ligada a uma etapa que virou passada continua salvável
 * — se o servidor recusasse, salvar a tarefa sem mexer no vínculo quebraria porque o corpo
 * reenvia o mesmo `activityId`.
 */
import { NotFoundError, ValidationError } from "../errors";
import { isActivitySelectableForNewTask, type ActivityStatus } from "../project/cronograma-rules";

export const TASK_ACTIVITY_NOT_FOUND_MESSAGE = "Atividade do cronograma não encontrada";
export const TASK_ACTIVITY_PROJECT_MESSAGE = "Atividade do cronograma pertence a outro projeto";
export const TASK_ACTIVITY_GLOBAL_MESSAGE = "Quest global não tem atividade do cronograma";
export const TASK_ACTIVITY_INVALID_MESSAGE = "Atividade do cronograma é inválida";
export const TASK_ACTIVITY_CLOSED_MESSAGE = "Atividade concluída não aceita nova tarefa";

/**
 * O que o use case precisa saber da atividade para decidir: existe, a que projeto pertence e o
 * status. plan-v21 S01 (DEC-257) acrescentou o status: só OPEN é destino de tarefa nova. Ainda
 * é a leitura mínima — nem mês, nem recompensa.
 */
export interface TaskActivityRef {
  id: number;
  projectId: number;
  status: ActivityStatus;
}

/**
 * Decide o valor gravado em `tasks.activityId`.
 *
 *   ausente, nulo ou vazio  → null (a tarefa não pertence a etapa nenhuma)
 *   quest global            → recusa: quest não tem projeto, e atividade é do projeto
 *   atividade inexistente   → NotFound
 *   atividade de outro projeto → Validation
 *   criação com linha não-OPEN → Validation nomeando o motivo (DEC-257)
 *
 * `isCreate` é o que separa os dois caminhos: na criação a linha precisa ser OPEN; no update a
 * regra de status NÃO vale — o corpo do PUT reenvia o vínculo de uma etapa que virou
 * COMPLETION_REQUESTED ou DONE, e recusar ali quebraria salvar tarefa sem mexer no vínculo
 * (mesma razão medida da DEC-99 para linha passada).
 *
 * `activityId` chega cru do corpo da rota, por isso é normalizado aqui: número inteiro positivo
 * ou nada. `projectId` é o projeto EFETIVO da tarefa (o merge do update já decidiu ele antes).
 */
export function resolveTaskActivityLink(input: {
  activityId: unknown;
  activity: TaskActivityRef | null;
  projectId: number | null;
  isGlobal: boolean;
  isCreate: boolean;
}): number | null {
  const { activityId, activity, projectId, isGlobal, isCreate } = input;

  if (activityId === undefined || activityId === null || activityId === "") {
    return null;
  }

  const id = Number(activityId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(TASK_ACTIVITY_INVALID_MESSAGE);
  }

  if (isGlobal) {
    throw new ValidationError(TASK_ACTIVITY_GLOBAL_MESSAGE);
  }

  if (!activity) {
    throw new NotFoundError(TASK_ACTIVITY_NOT_FOUND_MESSAGE);
  }

  if (activity.projectId !== projectId) {
    throw new ValidationError(TASK_ACTIVITY_PROJECT_MESSAGE);
  }

  if (isCreate && !isActivitySelectableForNewTask(activity.status)) {
    throw new ValidationError(TASK_ACTIVITY_CLOSED_MESSAGE);
  }

  return activity.id;
}
