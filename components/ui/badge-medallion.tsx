"use client"

/**
 * BadgeMedallion — fonte única do ícone de badge (plan-v17 S01, R1, ADR-001 / DEC-244).
 *
 * Cadeia fechada, nesta ordem: imagem do bucket pela rota autenticada
 * `GET /api/badges/[id]/icon/file` com `?v=<iconKey>` como quebra de cache (DEC-243) >
 * texto `icon` sobre a cor do badge > ícone Lucide da categoria. Chips do bloco Badges,
 * medálhões do card de identidade e o picker de equipar consomem a mesma peça.
 * O rótulo de categoria vem do domínio (`badgeCategoryLabel`); a cor de categoria fica
 * só aqui, porque é classe CSS.
 */

import { Award, Crown, Target, Trophy, Users } from "lucide-react"

import type { BadgeCategory } from "@/backend/domain"

export interface MedallionBadge {
  id: number
  name: string
  iconKey?: string | null
  icon?: string | null
  color?: string | null
  category: BadgeCategory
}

export function badgeCategoryChipClass(category: BadgeCategory): string {
  switch (category) {
    case "achievement":
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-warning/15 dark:text-yellow-300 dark:border-warning/25"
    case "milestone":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-info/15 dark:text-blue-300 dark:border-info/25"
    case "special":
      return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25"
    case "social":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-success/15 dark:text-green-300 dark:border-success/25"
    default:
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-muted/50 dark:text-gray-200 dark:border-border"
  }
}

export function BadgeCategoryIcon({ category, className }: { category: BadgeCategory; className: string }) {
  switch (category) {
    case "achievement":
      return <Trophy className={className} aria-hidden="true" />
    case "milestone":
      return <Target className={className} aria-hidden="true" />
    case "special":
      return <Crown className={className} aria-hidden="true" />
    case "social":
      return <Users className={className} aria-hidden="true" />
    default:
      return <Award className={className} aria-hidden="true" />
  }
}

export function BadgeMedallion({
  badge,
  size = "sm",
  className = "",
}: {
  badge: MedallionBadge
  size?: "sm" | "md"
  className?: string
}) {
  const box = size === "md" ? "h-10 w-10 rounded-full" : "h-4 w-4 rounded-full"

  if (badge.iconKey) {
    return (
      <img
        src={`/api/badges/${badge.id}/icon/file?v=${encodeURIComponent(badge.iconKey)}`}
        alt={`Ícone do ${badge.name}`}
        className={`${box} object-contain ${className}`}
      />
    )
  }

  if (badge.icon) {
    return (
      <span
        className={`flex items-center justify-center text-white ${box} ${className}`}
        style={badge.color ? { backgroundColor: badge.color } : undefined}
      >
        <span>{badge.icon}</span>
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center ${box} ${badgeCategoryChipClass(badge.category)} ${className}`}
    >
      <BadgeCategoryIcon category={badge.category} className={size === "md" ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  )
}
