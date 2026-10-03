import type { ITask, Task } from "@/backend/domain"

export interface ListTasksForActorQuery {
  actorId: number
  actorRoles: string[]
  projectId?: number
}

export type CreateTaskCommand = Omit<ITask, "id" | "points"> & {
  // plan-v3 DEC-30: caller no longer defines the award. Kept only for internal/backlog callers
  // that still carry the historical value; when absent, createTaskRecord applies POINTS_PER_TASK.
  points?: number
  creationMode?: "individual" | "shared"
}

export interface CreateTaskBacklogCommand {
  tasks: CreateTaskCommand[]
}

export interface UpdateTaskCommand {
  taskId: number
  actorId: number
  data: Record<string, unknown>
}

export interface DeleteTaskCommand {
  taskId: number
  actorId: number
}

export interface CompleteTaskCommand {
  taskId: number
  userId: number
}

export interface ApproveTaskCommand {
  taskId: number
  approverId: number
}

/**
 * plan-v3 OND4-A (AC-P3-08) — o que a conclusão e a aprovação devolvem: a tarefa **e** o prêmio
 * que esta ação creditou.
 *
 * Medido antes de desenhar (2026-10-03): os dois casos de uso devolviam só a `Task`, e o valor
 * creditado morria dentro do publicador de gamificação. O plano previa expor `awardedPoints` pelo
 * read model da tarefa (`withActorProgress`); medido, esse read model é congelado, é o *overlay de
 * progresso por pessoa* da lista, e o valor que ele carregaria seria o **pedido**, não o
 * creditado — que difere por três peculiaridades (idempotência → 0, `Math.floor`, e o fato de a
 * aprovação creditar o **responsável**, não quem aprovou). A costura certa é o retorno do award.
 *
 * `awardedTo` existe porque a aprovação credita `task.assignedTo` — quase nunca quem aprovou
 * (autoaprovação é proibida, salvo quem tem MANAGE_USERS). Sem isso no contrato, o cliente
 * animaria o contador de quem aprovou com o prêmio de outra pessoa.
 */
export interface TaskCompletionResult {
  task: Task
  /**
   * Para quem esta ação tentou creditar; `null` quando a ação não credita ninguém agora — tarefa
   * delegada que foi para "in-review" (o prêmio fica para a aprovação), ou tarefa sem responsável.
   *
   * Não significa "recebeu": o par é sempre lido junto. Um `awardedTo` com `awardedPoints: null`
   * é o caminho sem publisher de gamificação ligado (roundtrip G4, ambiente sem award) — a ação
   * tentou, o creditador não rodou.
   */
  awardedTo: number | null
  /**
   * Valor **efetivo** creditado (após `Math.floor` e a idempotência do award), ou `null` quando o
   * creditador não rodou. `0` com `awardedTo` preenchido é um caso real e distinto de `null`: o
   * award já existia e nada mudou. Não há piso (DEC-39): uma entrega muito atrasada credita valor
   * negativo, e esse é o número que a interface mostra.
   */
  awardedPoints: number | null
}

export interface RejectTaskCommand {
  taskId: number
  approverId: number
  reason?: string
}
