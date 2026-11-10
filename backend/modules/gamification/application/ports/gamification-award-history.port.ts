import type { GamificationSourceType } from "@/backend/domain";

/**
 * GamificationAwardHistoryPort — OND6-B2. Idempotencia + award atomico, congelados
 * do gateway legado (:200-261): o award e o log history acontecem num unico
 * $transaction (users.update increment + history.create com descricao
 * `GAMIFICATION:<sourceType>:<sourceId>`). A descricao e construida pela regra pura
 * (buildAwardDescription) e o port apenas a persiste/consulta.
 */

export interface AwardLookup {
  userId: number;
  description: string;
}

export interface AwardRecord {
  userId: number;
  sourceType: GamificationSourceType;
  sourceId: number;
  description: string;
  pointsAwarded: number;
  xpAwarded: number;
}

/**
 * R13 (S13, ADR-004): a reversão de um prêmio de tarefa. Deduz exatamente o `pointsAwarded`
 * da linha original, cria a linha `GAMIFICATION:TASK_REVERSED:<taskId>` e APAGA a original —
 * a liberação é o que faz re-aprovar premiar de novo. Dedução sem piso (DEC-39). A linha de
 * premiação original não é apagada pela limpeza de feed (I2); aqui é a reversão, que a consome.
 * Idempotência: se a linha de reversão já existe, nada é escrito (uma transição deducta uma vez, I3).
 */
export interface TaskAwardReversal {
  userId: number;
  taskId: number;
  originalAwardDescription: string;
  reversalDescription: string;
}

export interface GamificationAwardHistoryPort {
  hasAward(lookup: AwardLookup): Promise<boolean>;
  awardAndRecord(record: AwardRecord): Promise<void>;
  /**
   * R13 (S13). Optional de propósito: a premiação de task não exige reversão para existir, e um
   * fake de teste de premiação só conhece `hasAward` + `awardAndRecord`. Quem exercita a reversão
   * (roundtrip G4 e o adaptador Prisma) a implementa.
   */
  reverseTaskAward?(reversal: TaskAwardReversal): Promise<{ reversedPoints: number } | null>;
}
