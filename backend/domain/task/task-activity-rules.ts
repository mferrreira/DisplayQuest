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

export const TASK_ACTIVITY_NOT_FOUND_MESSAGE = "Atividade do cronograma não encontrada";
export const TASK_ACTIVITY_PROJECT_MESSAGE = "Atividade do cronograma pertence a outro projeto";
export const TASK_ACTIVITY_GLOBAL_MESSAGE = "Quest global não tem atividade do cronograma";
export const TASK_ACTIVITY_INVALID_MESSAGE = "Atividade do cronograma é inválida";

/**
 * O que o use case precisa saber da atividade para decidir: existe e a que projeto pertence.
 * É a leitura mínima da porta `TaskActivitiesPort` — nem mês, nem status, nem recompensa.
 */
export interface TaskActivityRef {
  id: number;
  projectId: number;
}

/**
 * Decide o valor gravado em `tasks.activityId`.
 *
 *   ausente, nulo ou vazio  → null (a tarefa não pertence a etapa nenhuma)
 *   quest global            → recusa: quest não tem projeto, e atividade é do projeto
 *   atividade inexistente   → NotFound
 *   atividade de outro projeto → Validation
 *
 * `activityId` chega cru do corpo da rota, por isso é normalizado aqui: número inteiro positivo
 * ou nada. `projectId` é o projeto EFETIVO da tarefa (o merge do update já decidiu ele antes).
 */
export function resolveTaskActivityLink(input: {
  activityId: unknown;
  activity: TaskActivityRef | null;
  projectId: number | null;
  isGlobal: boolean;
}): number | null {
  const { activityId, activity, projectId, isGlobal } = input;

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

  return activity.id;
}
