/**
 * ActivityOverdueScanPort — leitura da varredura de atraso (V5-8, DEC-64).
 *
 * O filtro de datas NÃO está aqui de propósito: o prazo é o último dia do último mês
 * marcado (`activityPeriod`, derivado — DEC-132), e essa conta é a regra pura do domínio
 * que o use case aplica. A porta entrega candidatos: linhas `OPEN`/`COMPLETION_REQUESTED`
 * que ainda nunca foram notificadas (`overdueNotifiedAt` nulo — a guarda de "uma só").
 *
 * `listGlobalManagerUserIds` lê `users` por adaptador próprio do módulo de projeto —
 * mesmo desenho medido do `ProjectHoursPort`/`ActivityEconomyTasksPort` (RG-04: o módulo
 * de projeto não importa repositório de outro módulo).
 */
import type { OverdueActivityView } from "@/backend/domain";

export interface OverdueActivityCandidate extends OverdueActivityView {
  id: number;
  description: string;
  projectName: string;
  leaderId: number | null;
}

export interface ActivityOverdueScanPort {
  listNotificationCandidates(): Promise<OverdueActivityCandidate[]>;
  /** Marca as linhas notificadas. Retorna quantas linhas receberam a marca. */
  markOverdueNotified(activityIds: number[], notifiedAt: Date): Promise<number>;
  /** Usuários ATIVOS com papel global COORDENADOR ou GERENTE (audiência da DEC-64). */
  listGlobalManagerUserIds(): Promise<number[]>;
}
