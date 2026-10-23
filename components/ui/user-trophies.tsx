"use client"

import { useCallback, useEffect, useState } from "react"
import { Crown, Trophy } from "lucide-react"

import { GamificationAPI } from "@/contexts/api-client"
import type { SeasonProgression, UserTrophyEntry } from "@/contexts/types"
import {
  ELO_LABELS,
  SEASON_CHAMPION_BADGE_NAME,
  TROPHY_EFFECT_LABELS,
  TROPHY_TIER_LABELS,
  isEloTier,
  trophySlotProgressLabel,
  type TrophyEffectVerb,
  type TrophyTier,
} from "@/backend/domain"

/**
 * UserTrophies — plan-v8 V8-7 (DEC-220). A prateleira de troféus do perfil (a tela que substitui o
 * chip de "Badges" de `user-badges.tsx`, que existia lendo a linha da conquista sem catálogo e, por
 * isso, não mostrava nada).
 *
 * Quem pode equipar é só a pessoa (DEC-218): o botão aparece quando `canEquip`, e a recusa chega do
 * servidor (`requireActorSelf` / slot cheio) — a tela não decide autoridade, só a exercita. O número
 * do teto vem do MESMO read model que o gate do use case usa (`trophySlots`), e a frase do slot é a do
 * domínio (`trophySlotProgressLabel`), não uma conta React.
 *
 * O troféu de campeão (DEC-213) é destacado pelos ANOS lidos do `season_history` (`championYears`),
 * não por olhar o nome na tela: quem reconhece o campeão do ano é a posição 1 do livro, e
 * `SEASON_CHAMPION_BADGE_NAME` (constante do domínio) só serve para marcar o card correspondente.
 */
function effectLabel(verb: TrophyEffectVerb, tier: TrophyTier): string {
  return `${TROPHY_EFFECT_LABELS[verb]} ${TROPHY_TIER_LABELS[tier]}`
}

function earnedLabel(earnedAt: string | null): string {
  if (!earnedAt) return ""
  return new Date(earnedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export interface UserTrophiesProps {
  userId: number
  /** A pessoa da sessão é o dono do perfil. Sem isso, a prateleira é leitura. */
  canEquip?: boolean
  /** Anos em que a pessoa fechou como campeã (lidos do livro-caixa pela tela). */
  championYears?: number[]
  limit?: number
  className?: string
}

export function UserTrophies({ userId, canEquip = false, championYears = [], limit, className = "" }: UserTrophiesProps) {
  const [trophies, setTrophies] = useState<UserTrophyEntry[]>([])
  const [progression, setProgression] = useState<SeasonProgression | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [equipError, setEquipError] = useState<string | null>(null)
  const [pendingBadgeId, setPendingBadgeId] = useState<number | null>(null)

  const reload = useCallback(async () => {
    const [conquistas, trilhas] = await Promise.all([
      GamificationAPI.getTrophies(userId),
      GamificationAPI.getProgression(userId),
    ])
    setTrophies(conquistas.trophies ?? [])
    setProgression(trilhas.progression ?? null)
  }, [userId])

  useEffect(() => {
    let alive = true
    setLoading(true)
    reload()
      .then(() => {
        if (alive) setLoadError(null)
      })
      .catch(() => {
        if (!alive) return
        setTrophies([])
        setLoadError("Erro ao carregar os troféus")
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [reload])

  const changeEquip = async (badgeId: number, action: "equip" | "unequip") => {
    setEquipError(null)
    setPendingBadgeId(badgeId)
    try {
      await GamificationAPI.changeTrophyEquip(userId, badgeId, action)
      await reload()
    } catch (error) {
      // A recusa é frase do domínio (slot cheio 409, não-conquistado 404, não-self 403). A tela
      // repete o que o servidor disse em vez de traduzir o status.
      setEquipError(error instanceof Error ? error.message : "Não foi possível mudar o troféu")
    } finally {
      setPendingBadgeId(null)
    }
  }

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-muted-foreground">Troféus</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 w-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-muted-foreground">Troféus</span>
        </div>
        <p className="text-xs text-muted-foreground">{loadError}</p>
      </div>
    )
  }

  const equippedCount = trophies.filter((trophy) => trophy.equipped).length
  const slots = progression?.trophySlots ?? 0
  const elo = progression ? (isEloTier(progression.elo) ? ELO_LABELS[progression.elo] : progression.elo) : null
  const shown = limit ? trophies.slice(0, limit) : trophies
  const championSet = new Set(championYears)

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-muted-foreground">
            Troféus ({trophies.length})
          </span>
        </div>
        {progression ? (
          <span className="text-xs text-muted-foreground" data-testid="trophy-slot-progress">
            {trophySlotProgressLabel(equippedCount, slots)}
            {elo ? ` · elo ${elo}` : ""}
          </span>
        ) : null}
      </div>

      {championSet.size > 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium text-warning" data-testid="trophy-champion-banner">
          <Crown className="h-4 w-4" aria-hidden="true" />
          Campeão {Array.from(championSet)
            .sort((a, b) => b - a)
            .join(" · ")}
        </p>
      ) : null}

      {equipError ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {equipError}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum troféu conquistado ainda</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((trophy) => {
            const isChampion = trophy.name === SEASON_CHAMPION_BADGE_NAME
            const slotFull = !trophy.equipped && equippedCount >= slots
            const Icon = isChampion ? Crown : Trophy
            return (
              <li
                key={trophy.userBadgeId}
                className={`rounded-lg border p-3 transition-colors ${
                  trophy.equipped ? "border-primary/45 bg-primary/5" : "border-border bg-muted/25"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className={`h-5 w-5 flex-shrink-0 ${trophy.equipped ? "text-primary" : "text-muted-foreground"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="truncate text-sm font-medium">{trophy.name}</h4>
                      <span className="text-xs text-muted-foreground">{earnedLabel(trophy.earnedAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{trophy.description}</p>
                    {trophy.effects.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Enquanto equipado:{" "}
                        {trophy.effects.map((effect) => effectLabel(effect.verb, effect.tier)).join(" · ")}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      {trophy.equipped ? (
                        <span className="text-xs font-medium text-primary">Equipado</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Na prateleira</span>
                      )}
                      {canEquip ? (
                        <button
                          type="button"
                          onClick={() => changeEquip(trophy.badgeId, trophy.equipped ? "unequip" : "equip")}
                          disabled={pendingBadgeId === trophy.badgeId || slotFull}
                          aria-label={`${trophy.equipped ? "Desequipar" : "Equipar"} ${trophy.name}`}
                          title={slotFull ? "Não há slot livre no seu elo" : undefined}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {trophy.equipped ? "Desequipar" : "Equipar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Chip compacto de troféus para listagens (busca de pessoas, cartões). */
export function UserTrophiesChip({ userId, limit = 3, className = "" }: { userId: number; limit?: number; className?: string }) {
  const [trophies, setTrophies] = useState<UserTrophyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    GamificationAPI.getTrophies(userId)
      .then((response) => {
        if (alive) setTrophies(response.trophies ?? [])
      })
      .catch(() => {
        if (alive) setTrophies([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [userId])

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Trophy className="h-4 w-4 animate-pulse text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-muted-foreground">Troféus</span>
      </div>
    )
  }

  if (trophies.length === 0) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-muted-foreground">Sem troféus</span>
      </div>
    )
  }

  const equipped = trophies.filter((trophy) => trophy.equipped).slice(0, limit)
  const listed = (equipped.length > 0 ? equipped : trophies).slice(0, limit)

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-muted-foreground">Troféus ({trophies.length})</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {listed.map((trophy) => (
          <span
            key={trophy.userBadgeId}
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
              trophy.equipped ? "border-primary/45 bg-primary/5 text-primary" : "border-border text-muted-foreground"
            }`}
            title={trophy.description}
          >
            {trophy.name}
          </span>
        ))}
      </div>
    </div>
  )
}
