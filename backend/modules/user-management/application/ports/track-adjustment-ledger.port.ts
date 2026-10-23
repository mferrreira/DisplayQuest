import type { AwardBalanceTrack, TrackAdjustmentAction } from "@/backend/domain";

/**
 * TrackAdjustmentLedgerPort — plan-v8 V8-5 (ASK-V8-24, respondida pelo dono em 2026-10-22).
 *
 * O ajuste manual de trilha no painel admin é a ÚNICA escrita de saldo que não nasce de um
 * evento de jogo, então ela tem ledger próprio: cada ajuste grava uma linha de `history` com a
 * trilha, a ação, o número informado e os saldos antes e depois. É o que responde "quem mexeu no
 * saldo de fulano e quando".
 *
 * Não é o ledger do award: ajuste não tem chave de idempotência (dois cliques são dois ajustes),
 * e a linha é de outra família (`action` TRACK_ADJUSTMENT), para as rotinas de idempotência de
 * premiação — que leem `GAMIFICATION_AWARD` por descrição — não encontrarem um ajuste como credit
 * de evento.
 */
/**
 * O ajuste, na forma que o port recebe. Quem faz a aritmética é a regra pura do domínio
 * (`applyTrackAdjustment`), aplicada DENTRO do $transaction do adaptador: escrever o saldo e
 * gravar a linha de auditoria é um passo só, como no award (increment + history na mesma
 * transação), e é por isso que o port não recebe saldo antes/depois calculado por fora.
 */
export interface TrackAdjustmentCommand {
  userId: number;
  /** Quem ajustou. Ajuste manual é ação de pessoa: nunca `systemActor` (DEC-54). */
  actorId: number;
  track: AwardBalanceTrack;
  action: TrackAdjustmentAction;
  /** O número informado por quem ajustou. */
  amount: number;
}

export type TrackAdjustmentResult =
  | { applied: true; track: AwardBalanceTrack; balanceBefore: number; balanceAfter: number }
  | { applied: false; reason: "usuario-ausente" };

export interface TrackAdjustmentLedgerPort {
  adjust(command: TrackAdjustmentCommand): Promise<TrackAdjustmentResult>;
}
