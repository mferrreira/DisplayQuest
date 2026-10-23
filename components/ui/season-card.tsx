"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Coins, Sparkles, Trophy, Zap } from "lucide-react"

import { GamificationAPI } from "@/contexts/api-client"
import type { SeasonProgression } from "@/contexts/types"
import { ELO_LABELS, currentSeasonYearOfInstant } from "@/backend/domain"

/**
 * SeasonCard — plan-v8 V8-7 (DEC-220). O cartão da temporada do perfil: as trilhas da pessoa lidas
 * dos read models da gamificação, sem conta própria.
 *
 * O que a tela mostra e de onde vem:
 *   - **Pontos do mês** — `users.points`, o placar que o fechamento zera com snapshot (DEC-212). A
 *     palavra "acumulados" saiu do rótulo: era a trilha vitalícia que o plan-v8 desmembrou.
 *   - **XP e elo** — a trilha da temporada e o degrau derivado dela pela escada (`elo-rules.ts`). O
 *     "próximo degrau" vem do read model (`nextElo`/`xpToNextElo`), não de uma conta na tela: quem
 *     sabe a escada é o domínio.
 *   - **Moedas** — a trilha vitalícia da loja (DEC-215).
 *   - **Slots** — quantos troféus o elo do momento permite equipar (DEC-217). A prateleira mostra
 *     quantos estão equipados; o número do teto é o mesmo que o gate do equip usa.
 *
 * A posição no mês NÃO está aqui: a ordem é a régua do ranking (pontos → tarefas → XP → userId) e ela
 * mora no servidor. Ordenar a lista de usuários na tela por `points` seria a segunda régua dormindo ao
 * lado da primeira — o link leva ao quadro, que é a autoridade.
 *
 * O `now` do rótulo da temporada vem do domínio (`currentSeasonYearOfInstant`), não de
 * `new Date().getFullYear()` na tela (DEC-132: dois lugares contando o ano divergem na virada).
 */
function Fact({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: React.ElementType
}) {
  const Icon = icon
  return (
    <div className="border-t border-border pt-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-3xl font-bold tabular-nums leading-none">{value}</dd>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function SeasonCard({ userId, seasonLabel = "Temporada" }: { userId: number; seasonLabel?: string }) {
  const [progression, setProgression] = useState<SeasonProgression | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    GamificationAPI.getProgression(userId)
      .then((response) => {
        if (!alive) return
        setProgression(response.progression ?? null)
        setError(null)
      })
      .catch(() => {
        if (!alive) return
        setProgression(null)
        setError("Não foi possível ler suas trilhas agora.")
      })
    return () => {
      alive = false
    }
  }, [userId])

  const year = currentSeasonYearOfInstant(new Date())

  if (error) {
    return (
      <section aria-labelledby="season-card" className="space-y-2">
        <h2 id="season-card" className="text-sm font-semibold">
          {seasonLabel} {year}
        </h2>
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      </section>
    )
  }

  if (!progression) {
    return (
      <section aria-labelledby="season-card" className="space-y-2">
        <h2 id="season-card" className="text-sm font-semibold">
          {seasonLabel} {year}
        </h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </section>
    )
  }

  const eloHint = progression.nextElo
    ? `${ELO_LABELS[progression.elo]} · faltam ${progression.xpToNextElo} XP para ${ELO_LABELS[progression.nextElo]}`
    : `${ELO_LABELS[progression.elo]} · elo máximo da temporada`

  return (
    <section aria-labelledby="season-card" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="season-card" className="text-sm font-semibold">
          {seasonLabel} {year}
        </h2>
        <Link href="/dashboard/leaderboard" className="text-sm font-medium text-primary hover:underline">
          Ver o quadro do mês
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
        <Fact
          icon={Zap}
          label="Pontos do mês"
          value={progression.points}
          hint="o placar fecha no fim do mês e recomeça"
        />
        <Fact
          icon={Sparkles}
          label="XP da temporada"
          value={progression.xp}
          hint={eloHint}
        />
        <Fact icon={Coins} label="Moedas" value={progression.coins} hint="vitalícias — a loja cobra nelas" />
        <Fact
          icon={Trophy}
          label="Slots de troféu"
          value={progression.trophySlots}
          hint={
            progression.trophySlots === 0
              ? "seu elo ainda não abre slot de troféu"
              : `equipar até ${progression.trophySlots} ao mesmo tempo`
          }
        />
      </dl>
    </section>
  )
}
