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

export interface GamificationAwardHistoryPort {
  hasAward(lookup: AwardLookup): Promise<boolean>;
  awardAndRecord(record: AwardRecord): Promise<void>;
}
