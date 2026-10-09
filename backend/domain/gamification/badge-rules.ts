/**
 * Regras puras de badge — OND6-B2 (R1), movidas de `badge.engine.ts` (140 linhas) e
 * `badge-rules.engine.ts` (161 linhas). Congeladas pelo golden OND6-B1.
 *
 * Pureza (RG-01 / PLAN ONDA 6): as regras RECEBEM dados por argumento (stats, roles,
 * todos os usuarios, badges conquistados) — nenhum repositorio no construtor.
 *
 * QUIRKs pinados pelo golden (preservados por AGENT.md §5.2):
 *   - QUIRK-6B: create força isActive=true mesmo com isActive:false no input
 *     (Badge.create espalha `...data` e depois sobrescreve isActive: true).
 *   - createdBy falsy (0) e tratado como ausente ("Criador do badge é obrigatório").
 *   - update NAO revalida categoria; isActive coercido por Boolean().
 *   - criterios numericos falsy (0) sao ignorados (`if (criteria.points && ...)`).
 *   - QUIRK-6C: evaluateSpecialCondition — "coordenador"/"gerente" SEM o role caem no
 *     default return true; condicao desconhecida => true.
 *   - streak de dias: comeca em 1 (1 log => 1), gap reseta, Math.ceil da diferenca.
 *
 * A concessoao em si (o efeito no store) fica nos use cases; aqui so a DECISAO.
 */

import { ValidationError } from "@/backend/domain/errors/DomainError";
import type { Badge, BadgeCategory, BadgeCriteria } from "@/backend/domain/gamification/Badge";

export const BADGE_CATEGORIES: readonly BadgeCategory[] = ["achievement", "milestone", "special", "social"];

/** Shape normalizado que o CreateBadgeUseCase entrega ao BadgeCatalogPort. */
export interface BadgeCreateData {
  name: string;
  description: string;
  icon: string | null;
  color: string | null;
  category: BadgeCategory;
  criteria: BadgeCriteria | null;
  isActive: boolean;
  createdBy: number;
}

export interface BadgeCreateInput {
  name?: string;
  description?: string;
  category?: string;
  icon?: string | null;
  color?: string | null;
  criteria?: BadgeCriteria | null;
  isActive?: boolean;
  createdBy?: number;
}

/** Validacoes + normalizacoes do create (frozen golden do BadgeEngine.create). */
export function validateBadgeCreateInput(data: BadgeCreateInput): BadgeCreateData {
  if (!data.name || !data.name.trim()) {
    throw new ValidationError("Nome do badge é obrigatório");
  }
  if (!data.description || !data.description.trim()) {
    throw new ValidationError("Descrição do badge é obrigatória");
  }
  if (!data.category) {
    throw new ValidationError("Categoria do badge é obrigatória");
  }
  if (!data.createdBy) {
    // QUIRK: createdBy 0 e tratado como ausente (falsy check legado).
    throw new ValidationError("Criador do badge é obrigatório");
  }

  const validCategories: BadgeCategory[] = [...BADGE_CATEGORIES];
  if (!validCategories.includes(data.category as BadgeCategory)) {
    throw new ValidationError("Categoria de badge inválida");
  }

  return {
    name: data.name.trim(),
    description: data.description.trim(),
    icon: data.icon || null,
    color: data.color || null,
    category: data.category as BadgeCategory,
    criteria: data.criteria || null,
    // QUIRK-6B: o caminho legado (Badge.create) forca isActive=true; preservado.
    isActive: true,
    createdBy: data.createdBy,
  };
}

/** Merge parcial do update (frozen golden do BadgeEngine.update). */
export function applyBadgeUpdate(current: Badge, data: Partial<BadgeCreateInput>): Badge {
  const merged: Badge = { ...current };

  if (data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw new ValidationError("Nome do badge é obrigatório");
    merged.name = name;
  }
  if (data.description !== undefined) {
    const description = String(data.description || "").trim();
    if (!description) throw new ValidationError("Descrição do badge é obrigatória");
    merged.description = description;
  }
  if (data.icon !== undefined) {
    merged.icon = data.icon;
  }
  if (data.color !== undefined) {
    merged.color = data.color;
  }
  if (data.category !== undefined) {
    // QUIRK: update nao revalida categoria (categoria bogus passa).
    merged.category = data.category as BadgeCategory;
  }
  if (data.criteria !== undefined) {
    merged.criteria = data.criteria;
  }
  if (data.isActive !== undefined) {
    merged.isActive = Boolean(data.isActive);
  }

  return merged;
}

/** Estatisticas que alimentam os criterios (shape do getUserStatistics legado). */
export interface BadgeUserStats {
  points: number;
  completedTasks: number;
  projectsCount: number;
  workSessionsCount: number;
  averageWeeklyHours: number;
  maxConsecutiveDays: number;
}

/** Resumo de usuario exigido pelas condicoes "primeiro ... 100". */
export interface UserRankEntry {
  id: number;
  points: number;
  completedTasks: number;
}

export interface BadgeCriteriaContext {
  userId: number;
  criteria: BadgeCriteria | null | undefined;
  stats: BadgeUserStats;
  roles: string[];
  weekHours: number;
  /** Todos os usuarios (para as condicoes de unicidade "primeiro ... 100"). */
  allUsers: UserRankEntry[];
}

/** userMeetsCriteria + evaluateSpecialCondition — frozen golden (QUIRK-6C incluido). */
export function badgeCriteriaMet(context: BadgeCriteriaContext): boolean {
  const { criteria, stats } = context;
  if (!criteria) return false;

  // QUIRK: thresholds falsy (0) sao ignorados — { points: 0 } vale para qualquer um.
  if (criteria.points && stats.points < criteria.points) return false;
  if (criteria.tasks && stats.completedTasks < criteria.tasks) return false;
  if (criteria.projects && stats.projectsCount < criteria.projects) return false;
  if (criteria.workSessions && stats.workSessionsCount < criteria.workSessions) return false;
  if (criteria.weeklyHours && stats.averageWeeklyHours < criteria.weeklyHours) return false;
  if (criteria.consecutiveDays && stats.maxConsecutiveDays < criteria.consecutiveDays) return false;

  if (criteria.specialCondition) {
    return specialConditionMet(context, criteria.specialCondition);
  }

  return true;
}

function specialConditionMet(context: BadgeCriteriaContext, condition: string): boolean {
  const { userId, stats, roles, weekHours, allUsers } = context;
  const conditionLower = condition.toLowerCase();

  if (conditionLower.includes("primeiro") && conditionLower.includes("100")) {
    if (conditionLower.includes("tarefas") && stats.completedTasks >= 100) {
      const usersWith100Tasks = allUsers.filter((u) => u.completedTasks >= 100);
      return usersWith100Tasks.length === 1 && usersWith100Tasks[0].id === userId;
    }

    if (conditionLower.includes("pontos") && stats.points >= 100) {
      const usersWith100Points = allUsers.filter((u) => u.points >= 100);
      return usersWith100Points.length === 1 && usersWith100Points[0].id === userId;
    }
  }

  if (conditionLower.includes("semana perfeita")) {
    return stats.averageWeeklyHours >= weekHours;
  }

  if (conditionLower.includes("sequência") && conditionLower.includes("dias")) {
    return stats.maxConsecutiveDays >= 7;
  }

  if (conditionLower.includes("coordenador") && roles.includes("COORDENADOR")) {
    return true;
  }

  if (conditionLower.includes("gerente") && roles.includes("GERENTE")) {
    return true;
  }

  // QUIRK-6C: "coordenador"/"gerente" sem o role caem aqui; condicao desconhecida => true.
  return true;
}

/**
 * evaluateUserForBadges como DECISAO pura: quais badges o usuario ainda nao tem e
 * cujos criterios estao atingidos. A persistencia (e o try/catch com console.error
 * do caminho legado) fica no EvaluateUserBadgesUseCase.
 */
export function selectBadgesToAward(input: {
  badges: Badge[];
  earnedBadgeIds: number[];
  userId: number;
  stats: BadgeUserStats;
  roles: string[];
  weekHours: number;
  allUsers: UserRankEntry[];
}): Badge[] {
  const newlyEarned: Badge[] = [];

  for (const badge of input.badges) {
    if (badge.id === undefined || input.earnedBadgeIds.includes(badge.id)) {
      continue;
    }

    if (
      badgeCriteriaMet({
        userId: input.userId,
        criteria: badge.criteria,
        stats: input.stats,
        roles: input.roles,
        weekHours: input.weekHours,
        allUsers: input.allUsers,
      })
    ) {
      newlyEarned.push(badge);
    }
  }

  return newlyEarned;
}

/** streak maximo de daily_logs — frozen golden (comeca em 1, gap reseta, Math.ceil). */
export function maxConsecutiveDaysFrom(dates: Date[]): number {
  const ordered = [...dates].sort((a, b) => a.getTime() - b.getTime());
  if (ordered.length === 0) {
    return 0;
  }

  let maxConsecutive = 0;
  let currentConsecutive = 1;

  for (let i = 1; i < ordered.length; i++) {
    const diffTime = ordered[i].getTime() - ordered[i - 1].getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentConsecutive++;
    } else {
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      currentConsecutive = 1;
    }
  }

  return Math.max(maxConsecutive, currentConsecutive);
}

/**
 * Media das amostras semanais (as amostras ja vem recortadas em "4 mais recentes"
 * pela porta — query congelada pelo golden: orderBy weekStart desc, take 4).
 */
export function averageWeeklyHoursFrom(samples: Array<{ totalHours: number }>): number {
  if (samples.length === 0) {
    return 0;
  }
  const totalHours = samples.reduce((sum, week) => sum + week.totalHours, 0);
  return totalHours / samples.length;
}
