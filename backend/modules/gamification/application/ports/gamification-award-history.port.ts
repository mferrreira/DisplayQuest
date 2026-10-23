import type { GamificationSourceType } from "@/backend/domain";

/**
 * GamificationAwardHistoryPort — OND6-B2. Idempotencia + award atomico, congelados
 * do gateway legado (:200-261): o award e o log history acontecem num unico
 * $transaction (users.update increment + history.create com descricao
 * `GAMIFICATION:<sourceType>:<sourceId>`). A descricao e construida pela regra pura
 * (buildAwardDescription) e o port apenas a persiste/consulta.
 *
 * V8-3 (DEC-214): quando o record traz o bloco `xp`, o MESMO $transaction escreve a segunda
 * trilha — `users.xp` incrementado e uma linha de `history` com track "XP" e a chave
 * `GAMIFICATION:XP:<sourceType>:<sourceId>`. E junto de proposito: creditar pontos sem creditar
 * XP (ou o contrario) e exatamente a deriva que a DEC-211 enterrou. A idempotencia continua a
 * descricao da fonte de pontos — a linha de XP nasce junto dela, nunca depois.
 */

export interface AwardLookup {
  userId: number;
  description: string;
}

/**
 * plan-v8 V8-3 (DEC-214): o credit de XP da MESMA fonte. Existe como bloco separado porque a
 * trilha tem linha própria no `history` (track "XP") e chave de idempotência própria
 * (`xpAwardDescription`) — uma linha não pode falar de duas trilhas.
 */
export interface XpAwardWrite {
  description: string;
  amount: number;
}

export interface AwardRecord {
  userId: number;
  sourceType: GamificationSourceType;
  sourceId: number;
  description: string;
  pointsAwarded: number;
  xp?: XpAwardWrite;
}

export interface GamificationAwardHistoryPort {
  hasAward(lookup: AwardLookup): Promise<boolean>;
  awardAndRecord(record: AwardRecord): Promise<void>;
}
