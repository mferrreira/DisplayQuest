"use client"

/**
 * ProfileBadgeShowcase — as badges equipadas no card de identidade (plan-v17 S02, R2-R5,
 * ADR-002 / DEC-245). Só `equipped`, no máximo EQUIP_SLOT_MAX, do earnedAt mais recente ao
 * mais antigo. Nome só em tooltip; sem equipada, nada renderiza — a ausência é a surpresa.
 * O card de terceiro mostra os mesmos medálhões: a leitura de user-badges já é aberta.
 */

import { useEffect, useState } from "react"

import { BadgesAPI } from "@/contexts/api-client"
import { subscribeEquipped } from "@/lib/badges/equipped-sync"
import { equipEffectLabel, EQUIP_SLOT_MAX, type BadgeEffect } from "@/backend/domain"
import { BadgeMedallion } from "@/components/ui/badge-medallion"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ShowcaseBadge {
  badgeId: number
  earnedAt: string
  equipped?: boolean
  badge?: {
    id: number
    name: string
    description: string
    icon?: string | null
    color?: string | null
    category: "achievement" | "milestone" | "special" | "social"
    iconKey?: string | null
    effect?: BadgeEffect | null
    isActive: boolean
  }
}

export function ProfileBadgeShowcase({ userId, className = "" }: { userId: number; className?: string }) {
  // plan-v17 S04 (R7): a vitrine guarda as linhas e deriva as equipadas — o sinal do
  // picker (`equipped-sync`) atualiza as linhas, e a vitrine acompanha sem remontar.
  const [rows, setRows] = useState<ShowcaseBadge[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await BadgesAPI.getUserBadges(userId)
        if (!cancelled) setRows(response.badges as ShowcaseBadge[])
      } catch {
        // O card não denuncia falha de badges: a vitrine é enfeite do card, o bloco Badges
        // tem o seu próprio estado de erro. Silêncio aqui é o desenho.
        if (!cancelled) setRows([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    const unsubscribe = subscribeEquipped(userId, (badgeId, next) => {
      setRows((prev) => prev.map((b) => (b.badgeId === badgeId ? { ...b, equipped: next } : b)))
    })
    return unsubscribe
  }, [userId])

  const equipped = rows
    .filter((b) => b.equipped && b.badge)
    .sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : a.earnedAt > b.earnedAt ? -1 : 0))
    .slice(0, EQUIP_SLOT_MAX)

  if (equipped.length === 0) return null

  return (
    <TooltipProvider delayDuration={0}>
      <div className={`flex items-center gap-2 ${className}`} aria-label="Badges equipadas">
        {equipped.map((b) => (
          <Tooltip key={b.badgeId}>
            {/* asChild injeta os handlers no elemento nativo; o medálhão é componente de
                função, então o trigger é um span focalizável — o medálhão vive dentro.
                Medido: o Radix NÃO injeta tabIndex no asChild, o tabIndex é daqui. */}
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex" aria-label={`Badge equipado: ${b.badge!.name}`}>
                <BadgeMedallion badge={b.badge!} size="md" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <div className="font-medium">{b.badge!.name}</div>
                <div className="text-xs text-muted-foreground">{b.badge!.description}</div>
                {b.badge!.effect && (
                  <div className="text-xs text-primary">{equipEffectLabel(b.badge!.effect)}</div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}
