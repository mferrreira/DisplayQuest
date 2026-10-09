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

export interface UserBadgePort {
  findByUserId(userId: number): Promise<UserBadge[]>;
  findRecentByUserId(userId: number, limit: number): Promise<UserBadge[]>;
  findByUserAndBadge(userId: number, badgeId: number): Promise<UserBadge | null>;
  create(data: UserBadgeCreateData): Promise<UserBadge>;
  delete(id: number): Promise<void>;
}
