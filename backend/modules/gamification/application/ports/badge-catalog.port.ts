import type { Badge, BadgeCategory } from "@/backend/domain";
import type { BadgeCreateData } from "@/backend/domain";

/**
 * BadgeCatalogPort — OND6-B2. CRUD de badges na forma do contract puro `Badge`
 * (o BadgeRepository legado devolvia instancias da classe Badge com include de
 * creator/userBadges que NENHUM consumidor lia — o adapter fino corta o join).
 */

export interface BadgeCatalogPort {
  findAll(): Promise<Badge[]>;
  findById(id: number): Promise<Badge | null>;
  findActive(): Promise<Badge[]>;
  findByCategory(category: BadgeCategory): Promise<Badge[]>;
  create(data: BadgeCreateData): Promise<Badge>;
  update(badge: Badge): Promise<Badge>;
  delete(id: number): Promise<void>;
}
