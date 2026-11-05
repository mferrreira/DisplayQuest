/**
 * Rótulo de categoria de badge — fonte única do vocabulário (plan-v17 S01, ADR-001,
 * lição DEC-95/96: o componente não tem vocabulário próprio). As três cópias de
 * `getCategoryName` medidas em `user-badges.tsx` e `badge-manager.tsx` colapsam aqui.
 */
import type { BadgeCategory } from "@/backend/domain/gamification/Badge";

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  achievement: "Conquista",
  milestone: "Marco",
  special: "Especial",
  social: "Social",
};

export function badgeCategoryLabel(category: BadgeCategory): string {
  return CATEGORY_LABELS[category];
}
