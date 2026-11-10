"use client"

/**
 * ProfileBadgeEquipPicker — o equipar na aba Configurações, em modo de edição (plan-v17 S03,
 * R6, R8, ADR-003 / DEC-246). Lista só as conquistadas com passiva: medálhão, nome, efeito,
 * contador "Equipadas (n/3)" e botão por badge. A autoridade continua na rota
 * POST /api/user-badges/[userId]/[badgeId]/equip com as frases de equip-rules; o picker não
 * re-aritmética regra nenhuma.
 */

import { useEffect, useState } from "react"

import { Trophy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BadgeMedallion } from "@/components/ui/badge-medallion"
import { BadgesAPI } from "@/contexts/api-client"
import { markEquipped } from "@/lib/badges/equipped-sync"
import {
  equipEffectLabel,
  EQUIP_SLOT_MAX,
  hasPassive,
  type BadgeEffect,
} from "@/backend/domain"

interface PickerBadge {
  badgeId: number
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

/** `hasPassive` estreita `effect` junto com o `badge` — a linha Renderizada tem os dois. */
type PickerRow = PickerBadge & { badge: NonNullable<PickerBadge["badge"]> & { effect: BadgeEffect } }

export function ProfileBadgeEquipPicker({ userId }: { userId: number }) {
  const [rows, setRows] = useState<PickerRow[]>([])
  const [alert, setAlert] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyBadgeId, setBusyBadgeId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await BadgesAPI.getUserBadges(userId)
        const passives = (response.badges as PickerBadge[]).filter(
          (b): b is PickerRow => b.badge != null && hasPassive(b.badge.effect)
        )
        if (!cancelled) {
          setRows(passives)
          setLoadFailed(false)
        }
      } catch {
        // Falha de leitura não é zero real: a casa avisa em role="alert" (padrão do painel).
        if (!cancelled) {
          setRows([])
          setLoadFailed(true)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const toggle = async (row: PickerRow, nextEquipped: boolean) => {
    setBusyBadgeId(row.badgeId)
    setAlert(null)
    try {
      await BadgesAPI.equip(userId, row.badgeId, nextEquipped)
      setRows((prev) => prev.map((r) => (r.badgeId === row.badgeId ? { ...r, equipped: nextEquipped } : r)))
      // S04 (R7): a equipagem é a fonte de verdade — bloco e vitrine assinam o sinal.
      markEquipped(userId, row.badgeId, nextEquipped)
    } catch (err: any) {
      setAlert(typeof err?.message === "string" && err.message ? err.message : "Não foi possível alterar o badge")
    } finally {
      setBusyBadgeId(null)
    }
  }

  const equippedCount = rows.filter((r) => r.equipped).length

  return (
    <section aria-labelledby="profile-equip-picker" className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="profile-equip-picker" className="text-sm font-semibold">
          Badges equipáveis
        </h2>
        {rows.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {`Equipadas (${equippedCount}/${EQUIP_SLOT_MAX})`}
          </span>
        )}
      </div>
      {alert && (
        <p role="alert" className="text-xs text-destructive">
          {alert}
        </p>
      )}
      {rows.length === 0 ? (
        loadFailed ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Não foi possível carregar os badges
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma badge com passiva</p>
        )
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.badgeId} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <BadgeMedallion badge={row.badge} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{row.badge.name}</p>
                <p className="text-xs text-primary">{equipEffectLabel(row.badge.effect)}</p>
              </div>
              <Button
                size="sm"
                variant={row.equipped ? "outline" : "secondary"}
                aria-label={`${row.equipped ? "Desequipar" : "Equipar"} ${row.badge.name}`}
                disabled={busyBadgeId === row.badgeId}
                onClick={() => toggle(row, !row.equipped)}
              >
                {row.equipped ? "Desequipar" : "Equipar"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
