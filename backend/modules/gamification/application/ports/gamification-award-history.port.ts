import type { AwardBalanceTrack, GamificationSourceType, TrophyCreditLedger } from "@/backend/domain";

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
 * descricao da fonte do credit — a linha de XP nasce junto dela, nunca depois.
 *
 * V8-5 (DEC-215): o record declara a trilha do credit (`track`) e o adaptador escreve a coluna de
 * saldo dessa trilha. O premio de atividade aprovada declara COINS e cai em `users.coins`; os dois
 * credits antigos (tarefa, sessao) seguem POINTS e caem em `users.points`. A chave de idempotencia
 * nao muda em nenhum dos dois: e sempre a descricao da fonte.
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

/**
 * plan-v8 V8-5 (DEC-215): `amount` é o montante creditado na TRILHA declarada por `track`, e a
 * coluna de `users` que recebe o credit é a da mesma trilha (`points` para POINTS, `coins` para
 * COINS). Antes o record só sabia creditar pontos; o prêmio de atividade aprovada passou a ser
 * moeda, e "pointsAwarded" na assinatura seria o nome mentindo sobre o destino. O nome do campo
 * no JSON do ledger continua nomeando a trilha da linha (`pointsAwarded` / `coinsAwarded`), como
 * a linha de XP já fazia com `xpAwarded`.
 */
export interface AwardRecord {
  userId: number;
  sourceType: GamificationSourceType;
  sourceId: number;
  description: string;
  amount: number;
  /** Trilha do credit e da linha. Ausente é POINTS (o default da coluna e o credit antigo). */
  track?: AwardBalanceTrack;
  xp?: XpAwardWrite;
  /**
   * plan-v8 V8-6 (DEC-219): a auditoria do efeito de troféu que já está aplicado em `amount`. O
   * valor chega ajustado porque quem aplica é a regra pura no use case (sobre o valor da régua e a
   * penalidade que a régua descontou); o port só escreve o número e a explicação dele. Ausente é
   * "sem efeito de troféu", e a linha continua exatamente como era antes da onda.
   */
  trophy?: TrophyCreditLedger;
}

export interface GamificationAwardHistoryPort {
  hasAward(lookup: AwardLookup): Promise<boolean>;
  awardAndRecord(record: AwardRecord): Promise<void>;
}
