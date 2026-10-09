/**
 * B6-7 (D4) — o gate de CAMPO do PUT /api/tasks/[id], medido na rota legado: quem NAO tem
 * MANAGE_TASKS so pode editar um corpo cujas chaves sejam EXCLUSIVAMENTE "status" e/ou
 * "assignedTo" (o movimento publico de progresso). A regra pura ja existia
 * (`isPublicProgressOnlyUpdate`, task-rules) e e reaproveitada; o que muda e ONDE decide:
 * o gate e calculado sobre o corpo CRU (antes do filtro de allowedFields) porque chaves que
 * a rota depois descarta tambem barram — ex.: {points: 5} de nao-gestor devolve 403 hoje.
 * Por isso o filtro `allowedFields` (que era da rota) passou para dentro do use case junto
 * com o gate: o gate ve o corpo cru, a mutacao ve o filtrado.
 */
export const TASK_EDITABLE_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "assignedTo",
  "assigneeIds",
  "projectId",
  "dueDate",
  "completed",
  "taskVisibility",
  "isGlobal",
] as const;

/** plan-v3 OND1-D (AC-P3-03): "points" NAO esta na lista — editar tarefa nao redefine valor. */
export function filterTaskEditFields(data: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of TASK_EDITABLE_FIELDS) {
    if (data[key] !== undefined) filtered[key] = data[key];
  }
  return filtered;
}
