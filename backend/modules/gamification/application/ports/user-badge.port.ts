import type { UserBadge } from "@/backend/domain";

/**
 * UserBadgePort — OND6-B2. Concessao/remocao de user-badges. Diferente do legado
 * (UserBadgeRepository.create exigia instancia com .toPrisma() — causa do QUIRK-6A
 * quando o BadgeRulesEngine passava objeto plain), o port recebe o DADO, nao a
 * instancia: `{ userId, badgeId, earnedBy }`.
 */

export interface UserBadgeCreateData {
  userId: number;
  badgeId: number;
  earnedBy: number | null;
}

/** O troféu equipado com os efeitos do catálogo, lidos juntos no instantâneo do credit (DEC-219). */
export interface EquippedTrophyEffectRow {
  badgeId: number;
  /** O Json do catálogo, lido defensivamente pela regra (`readTrophyEffects`). */
  effects: unknown;
}

export interface UserBadgePort {
  findByUserId(userId: number): Promise<UserBadge[]>;
  findRecentByUserId(userId: number, limit: number): Promise<UserBadge[]>;
  findByUserAndBadge(userId: number, badgeId: number): Promise<UserBadge | null>;
  create(data: UserBadgeCreateData): Promise<UserBadge>;
  delete(id: number): Promise<void>;
  /** V8-6 (DEC-218): quantos troféus a pessoa tem EQUIPADOS hoje — a conta do slot do elo. */
  countEquipped(userId: number): Promise<number>;
  /**
   * V8-6 (DEC-219): os efeitos dos troféus equipados, lidos NO instantâneo do credit. Uma query só
   * (o join com `badges` traz o `effects` do catálogo): quem equipou em novembro e desequipou em
   * dezembro não aparece em dezembro, e é isso que "o boost é lido no instantâneo" quer dizer.
   */
  findEquippedEffectsByUserId(userId: number): Promise<EquippedTrophyEffectRow[]>;
  /** V8-6 (DEC-218): equipar/desequipar é escrever a coluna `equipped` na linha da conquista. */
  setEquipped(id: number, equipped: boolean): Promise<UserBadge>;
}
