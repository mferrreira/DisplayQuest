"use client"

import Link from "next/link"
import { Crown, Medal, Award } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getRoleDisplayName } from "@/lib/utils/access-control"
import { userImageUrl } from "@/lib/api/user-images"

/**
 * S07 (plan-v11, R7) — o pódio do quadro de liderança, extraído da página para ter aceite.
 *
 * O bloco do campeão é o mesmo de V6-11m/V5-3 (coroa, capa translúcida, pontos grandes).
 * O que muda é o par 2º/3º: cada um passa a um CARTÃO (borda + fundo de card, pela regra
 * "cada um em cartão" do dono) com medalha, avatar, nome, papel e pontos, e o link ao
 * perfil permanece. A extração não muda markup do campeão — só move.
 */
export interface PodiumEntry {
  id: number
  name: string
  value: number
  position: number
  avatar?: string | null
  bannerKey?: string | null
  roles?: string[] | null
}

interface LeaderboardPodiumProps {
  champion: PodiumEntry
  runnersUp: PodiumEntry[]
}

function getInitials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().substring(0, 2)
}

function getRoleLabel(roles: string[]) {
  return roles.map(getRoleDisplayName).join(", ")
}

export function LeaderboardPodium({ champion, runnersUp }: LeaderboardPodiumProps) {
  return (
    <>
      <section aria-label="Campeão do quadro">
        <Link
          href={`/dashboard/profile?userId=${champion.id}`}
          className="relative block overflow-hidden rounded-lg border border-warning/30 bg-warning/5 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* V5-3 (DEC-137): a capa do 1º lugar entra como fundo translúcido do bloco. */}
          {champion.bannerKey ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userImageUrl(champion.id, "banner", champion.bannerKey)}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover opacity-20"
              />
            </>
          ) : null}
          <div className="relative flex flex-wrap items-center gap-4 p-5 sm:gap-6 sm:p-8">
            <Crown className="h-8 w-8 shrink-0 text-warning sm:h-10 sm:w-10" aria-hidden="true" />
            <Avatar className="h-14 w-14 border-2 border-warning/50 sm:h-20 sm:w-20">
              <AvatarImage src={champion.avatar || undefined} alt={champion.name} />
              <AvatarFallback className="text-lg font-bold sm:text-xl">{getInitials(champion.name)}</AvatarFallback>
            </Avatar>
            {/* `hyphens-auto`/`break-words`/`shrink-0` no bloco do número: medido em 390px no
                fechamento de V6-11m — o bloco do campeão não muda com a extração. */}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">1º lugar</p>
              <p className="break-words text-xl font-bold hyphens-auto text-foreground sm:text-2xl">
                {champion.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {getRoleLabel(champion.roles || []) || "Membro do laboratório"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-4xl font-bold tabular-nums text-foreground">{champion.value}</p>
              <p className="text-xs text-muted-foreground">pontos</p>
            </div>
          </div>
        </Link>
      </section>

      {runnersUp.length > 0 && (
        <section
          aria-label="Segundo e terceiro lugares"
          className="grid gap-8 sm:grid-cols-2 sm:divide-x sm:divide-border"
        >
          {runnersUp.map((runnerUp) => {
            const Icon = runnerUp.position === 2 ? Medal : Award
            const accent = "text-warning"
            return (
              <Link
                key={runnerUp.id}
                href={`/dashboard/profile?userId=${runnerUp.id}`}
                className={`flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  runnerUp.position === 2 ? "sm:pr-4" : "sm:pl-4"
                }`}
              >
                <span className={`text-3xl font-bold tabular-nums ${accent}`} aria-hidden="true">
                  {runnerUp.position}º
                </span>
                <Avatar className="h-12 w-12">
                  <AvatarImage src={runnerUp.avatar || undefined} alt={runnerUp.name} />
                  <AvatarFallback>{getInitials(runnerUp.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                    <Icon className={`h-4 w-4 shrink-0 ${accent}`} aria-hidden="true" />
                    {runnerUp.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {getRoleLabel(runnerUp.roles || []) || "Membro do laboratório"}
                  </p>
                </div>
                <p className="shrink-0 font-bold tabular-nums text-foreground">{runnerUp.value}</p>
              </Link>
            )
          })}
        </section>
      )}
    </>
  )
}
