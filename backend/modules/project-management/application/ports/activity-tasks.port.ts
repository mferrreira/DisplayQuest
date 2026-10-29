/**
 * V5-7a (DEC-99/162) — leitura de tarefa que o fluxo de conclusão da atividade precisa.
 *
 * É porta do módulo de projeto lendo a tabela do módulo de tasks — o mesmo desenho medido do
 * `ProjectHoursPort`, que lê `work_sessions` por adaptador próprio (RG-04: adaptador usa
 * Prisma, não o módulo vizinho). A trava DEC-99 conta tarefa ABERTA (não concluída) ligada à
 * linha do cronograma; a contagem é por `activityId`, e tarefa sem vínculo não pertence a
 * etapa nenhuma.
 */
export interface ActivityTasksPort {
  countOpenByActivity(activityId: number): Promise<number>
}
