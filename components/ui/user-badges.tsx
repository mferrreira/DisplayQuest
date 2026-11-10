"use client"

import { useState, useEffect } from "react"
import { BadgesAPI } from "@/contexts/api-client"
import { subscribeEquipped } from "@/lib/badges/equipped-sync"
import { badgeCategoryLabel, equipEffectLabel } from "@/backend/domain"
import { Trophy } from "lucide-react"
import { BadgeMedallion, badgeCategoryChipClass } from "@/components/ui/badge-medallion"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface UserBadge {
  id: number
  badgeId: number
  userId: number
  earnedAt: string
  earnedBy?: number | null
  equipped?: boolean
  badge?: {
    id: number
    name: string
    description: string
    icon?: string | null
    color?: string | null
    category: 'achievement' | 'milestone' | 'special' | 'social'
    criteria?: any
    slug?: string | null
    effect?: { kind: "bonus" | "penaltyReduction"; pct: number } | null
    /** plan-v16 S04 (R6): CHAVE do arquivo no bucket; o binário sai pela rota autenticada. */
    iconKey?: string | null
    isActive: boolean
  }
}

interface UserBadgesProps {
  userId: number
  showAll?: boolean
  limit?: number
  className?: string
}

export function UserBadges({ userId, showAll = false, limit = 6, className = "" }: UserBadgesProps) {
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        setLoading(true)
        const response = await BadgesAPI.getUserBadges(userId, showAll ? undefined : limit)
        setBadges(response.badges || [])
        // plan-v18 S02 (DEC-248, ADR-005): `progress` chega do servidor e o bloco não o
        // renderiza — a lista "Em progresso" saiu da tela do perfil.
        setError(null)
      } catch (err: any) {
        console.error("Erro ao buscar badges:", err)
        setError("Erro ao carregar badges")
        setBadges([])
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchBadges()
    }
  }, [userId, showAll, limit])

  // plan-v17 S04 (R7, ADR-003): o bloco é leitura — o equipar mora no picker da
  // Configurações. O bloco acompanha o estado pelo cache compartilhado.
  useEffect(() => {
    const unsubscribe = subscribeEquipped(userId, (badgeId, next) => {
      setBadges((prev) => prev.map((b) => (b.badgeId === badgeId ? { ...b, equipped: next } : b)))
    })
    return unsubscribe
  }, [userId])

  const formatEarnedDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Hoje'
    if (diffInDays === 1) return 'Ontem'
    if (diffInDays < 7) return `${diffInDays} dias atrás`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} semanas atrás`
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} meses atrás`
    return `${Math.floor(diffInDays / 365)} anos atrás`
  }

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Badges</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 w-44 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Badges</span>
        </div>
        <p className="text-xs text-muted-foreground">Erro ao carregar badges</p>
      </div>
    )
  }

  const safeBadges = badges.filter((userBadge): userBadge is typeof userBadge & { badge: NonNullable<typeof userBadge.badge> } => Boolean(userBadge.badge))

  if (safeBadges.length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Badges</span>
        </div>
        <p className="text-xs text-muted-foreground">Nenhum badge conquistado ainda</p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Badges ({safeBadges.length})
        </span>
      </div>

      {/* plan-v18 S02 (DEC-248, ADR-005): as conquistadas entram em cartões discretos,
          mais largos que altos, com medálhão, nome, selo do efeito e data relativa.
          Os chips "Em progresso" saíram da tela — o bloco é só o que a pessoa possui. */}
      <div className="flex flex-wrap gap-3">
        <TooltipProvider>
          {safeBadges.map((userBadge) => (
            <Tooltip key={userBadge.id}>
              <TooltipTrigger asChild>
                <div
                  data-testid="badge-card"
                  className={`flex w-44 items-center gap-3 rounded-lg border bg-card p-3 cursor-help transition-all hover:scale-105 ${
                    userBadge.equipped ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {/* plan-v17 S01 (R1, ADR-001): a peça única desenha o ícone — bucket >
                      texto `icon` > Lucide de categoria. Nenhum glifo local aqui. */}
                  <BadgeMedallion badge={userBadge.badge} size="sm" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">{userBadge.badge.name}</p>
                    {userBadge.badge.effect && (
                      <p className="text-xs font-semibold text-primary">
                        {userBadge.equipped ? "Equipada: " : "Passiva: "}
                        {equipEffectLabel(userBadge.badge.effect)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatEarnedDate(userBadge.earnedAt)}</p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <div className="font-medium">{userBadge.badge.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {userBadge.badge.description}
                  </div>
                  {userBadge.badge.effect && (
                    <div className="text-xs text-primary">
                      {userBadge.equipped ? "Equipada: " : "Passiva: "}
                      {equipEffectLabel(userBadge.badge.effect)}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${badgeCategoryChipClass(userBadge.badge.category)}`}>
                      {badgeCategoryLabel(userBadge.badge.category)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatEarnedDate(userBadge.earnedAt)}
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  )
}
