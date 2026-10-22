export interface TaskCompletedEvent {
  userId: number;
  taskId: number;
  taskPoints: number;
  /**
   * V5-7b (DEC-63): o projeto da tarefa concluída, ou `null` para quest global.
   * V8-1 (DEC-215): ele deixou de ser a chave de uma escrita em `projects.points` (a coluna
   * saiu) e nenhum adaptador escreve a partir dele hoje. Continua no contrato porque é a
   * identidade medida do evento: os três call sites (`complete` ×2, `approve` ×1) já a
   * entregam, e `null` (quest global) é um caso próprio do evento.
   */
  projectId: number | null;
}

/**
 * plan-v3 OND4-A (AC-P3-08) — o publicador deixa de engolir o resultado do award.
 *
 * Medido antes de mudar (2026-10-03): `awardFromTaskCompletion` (gamification) devolvia
 * `GamificationAwardResult { pointsAwarded, alreadyAwarded, newProgression }` e o adaptador
 * daqui **descartava**: a porta era `Promise<void>` e o caso de uso só tinha em mãos o valor
 * que pediu (`awardPointsForCompletion`), não o valor creditado. As duas coisas divergem de
 * verdade, por três peculiaridades congeladas do outro lado:
 *
 *   - **idempotência**: award já registrado → `pointsAwarded: 0` (o pedido era 10);
 *   - **`taskAwardPoints`**: `Math.floor` sem clamp — peculiaridade própria do caminho de tarefa;
 *   - **`alreadyAwarded`**: a segunda conclusão da mesma tarefa credita zero, e é o número
 *     honesto para a interface mostrar "não mudou nada".
 *
 * Por isso a porta devolve o **efetivo**, e o caso de uso o carrega até a resposta HTTP: o
 * cliente não recalcula (R7) e a animação da Onda 4.B tem um número do servidor.
 *
 * `null` = ninguém foi creditado: publisher ausente (o roundtrip G4 liga o módulo sem award de
 * propósito), ou o award **falhou**. Falha de award nunca quebra a conclusão — congelado
 * (task-view.ts:116) — então `null` também é o caminho do erro, não uma exceção.
 */
export interface TaskProgressEvents {
  /** `creditedPoints` = valor creditado (0 quando o award já existia); `null` = ninguém creditado. */
  onTaskCompleted(event: TaskCompletedEvent): Promise<number | null>;
}
