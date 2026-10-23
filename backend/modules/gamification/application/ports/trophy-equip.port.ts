import type { TrophyEquipAction } from "@/backend/domain/gamification";

/**
 * TrophyEquipPort — plan-v8 V8-6 (DEC-218/217). A escrita do equipar/desequipar: a linha de
 * `user_badges.equipped` e a linha de auditoria em `history`, na MESMA transação.
 *
 * A port devolve FATOS e estados, nunca decisão (mesma disciplina do fechamento mensal e da revisão
 * semanal de XP): quem decide o teto de `slots` é o use case, com a escada do elo do momento
 * (`trophySlotsForElo`), e o adaptador confere a contagem DENTRO do `$transaction` — dois cliques
 * concorrentes não podem equipar dois troféus num elo de um slot, e o `count` lido antes do use case
 * não é a trava.
 *
 * Os estados devolvidos são o vocabulário que o use case traduz em erro (ou em nenhum erro):
 *   - `applied`   — o estado mudou e a linha de auditoria foi escrita;
 *   - `unchanged` — já estava no estado pedido: nenhuma linha escrita (o livro-caixa registra o que
 *     aconteceu, e não aconteceu nada);
 *   - `slot-full` — a contagem dentro da transação não coube no teto;
 *   - `not-earned`— não existe linha de conquista: não há o que equipar.
 */

export interface TrophyEquipWrite {
  userId: number;
  badgeId: number;
  action: TrophyEquipAction;
  /** O teto decidido pelo elo DO MOMENTO (DEC-217): "o elo do momento manda". */
  slots: number;
  /** O degrau que decidiu o teto, reportado na linha de auditoria. */
  elo: string;
  /** Chave da idempotência/auditoria: `GAMIFICATION:TROPHY_EQUIP|UNEQUIP:<pessoa>:<troféu>`. */
  description: string;
}

export interface TrophyEquipWriteResult {
  status: "applied" | "unchanged" | "slot-full" | "not-earned";
  equippedBefore: number;
  equippedAfter: number;
}

export interface TrophyEquipPort {
  applyEquip(write: TrophyEquipWrite): Promise<TrophyEquipWriteResult>;
}
