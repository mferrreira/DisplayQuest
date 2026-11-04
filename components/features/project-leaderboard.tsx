"use client"

import Link from "next/link"
import { Crown, Medal, Award } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { projectStatusLabel } from "@/components/ui/status"
import { projectImageUrl } from "@/lib/api/project-files"
import { rankProjects } from "@/features/projects/utils/project-ranking"
import type { Project } from "@/contexts/types"

/**
 * plan-v13 S06 (regra 6) — o leaderboard de projetos da aba Dashboard.
 *
 * O pódio segue o desenho medido da liderança de pessoas (`leaderboard-podium.tsx` do plan-v11):
 * campeão em bloco grande com acento dourado, capa translúcida e pontos em corpo grande; 2º e 3º
 * em cartões com medalha. Abaixo, a "Classificação completa" começa no 4º — o top 3 já está no
 * pódio, e repetir linha é o espelho medido que a liderança tinha e perdeu (V6-11m). Pódio e
 * linhas abrem o detalhe do projeto.
 *
 * Projeto sem capa não ganha `<img>` vazio: a rota de imagem exige chave, e o bloco do campeão
 * é legível sem a foto.
 */
interface ProjectLeaderboardProps {
  projects: Project[]
  onProjectSelect?: (project: Project) => void
}

export function ProjectLeaderboard({ projects, onProjectSelect }: ProjectLeaderboardProps) {
  const ranked = rankProjects(projects)
  const champion = ranked[0]
  const runnersUp = ranked.slice(1, 3)
  const rest = ranked.slice(3)

  const open = (project: Project) => onProjectSelect?.(project)

  return (
    <div className="space-y-6">
      {champion && (
        <section aria-label="Campeão dos projetos" className="rounded-lg">
          <Link
            href={`/dashboard/projetos/${champion.project.id}`}
            aria-label={`Ver detalhes de ${champion.project.name}`}
            onClick={(event) => {
              event.preventDefault()
              open(champion.project)
            }}
            className="relative block overflow-hidden rounded-lg border border-warning/30 bg-warning/5 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {champion.project.bannerKey ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={projectImageUrl(champion.project.id, "banner", champion.project.bannerKey)}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover opacity-20"
                />
              </>
            ) : null}
            <div className="relative flex flex-wrap items-center gap-4 p-5 sm:gap-6 sm:p-8">
              {champion.project.logoKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={projectImageUrl(champion.project.id, "logo", champion.project.logoKey)}
                  alt={champion.project.name}
                  className="h-14 w-14 rounded-lg border border-warning/50 bg-background object-contain p-1 sm:h-20 sm:w-20"
                />
              ) : (
                <Crown className="h-8 w-8 shrink-0 text-warning sm:h-10 sm:w-10" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-warning">Campeão</p>
                <p className="break-words text-xl font-bold hyphens-auto text-foreground sm:text-2xl">{champion.project.name}</p>
                {champion.project.subtitle && <p className="truncate text-sm text-muted-foreground">{champion.project.subtitle}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-4xl font-bold tabular-nums text-foreground">{champion.points}</p>
                <p className="text-xs text-muted-foreground">pontos</p>
              </div>
            </div>
          </Link>
        </section>
      )}

      {runnersUp.length > 0 && (
        <section aria-label="Segundo e terceiro lugares" className="grid gap-4 sm:grid-cols-2">
          {runnersUp.map((entry) => {
            const Icon = entry.position === 2 ? Medal : Award
            return (
              <Link
                key={entry.project.id}
                href={`/dashboard/projetos/${entry.project.id}`}
                aria-label={`Ver detalhes de ${entry.project.name}`}
                onClick={(event) => {
                  event.preventDefault()
                  open(entry.project)
                }}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-3xl font-bold tabular-nums text-warning" aria-hidden="true">{entry.position}º</span>
                {entry.project.logoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={projectImageUrl(entry.project.id, "logo", entry.project.logoKey)}
                    alt=""
                    aria-hidden="true"
                    className="h-10 w-10 rounded-md border bg-background object-contain p-0.5"
                  />
                ) : (
                  <Icon className="h-6 w-6 shrink-0 text-warning" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                    <Icon className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    {entry.project.name}
                  </p>
                  {entry.project.subtitle && <p className="truncate text-xs text-muted-foreground">{entry.project.subtitle}</p>}
                </div>
                <p className="shrink-0 font-bold tabular-nums text-foreground">{entry.points}</p>
              </Link>
            )
          })}
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="Classificação completa de projetos" className="space-y-3">
          <h3 className="font-semibold">Classificação completa</h3>
          <div className="divide-y rounded-lg border">
            {rest.map((entry) => (
              <Link
                key={entry.project.id}
                href={`/dashboard/projetos/${entry.project.id}`}
                aria-label={`Ver detalhes de ${entry.project.name}`}
                onClick={(event) => {
                  event.preventDefault()
                  open(entry.project)
                }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{entry.position}º</span>
                {entry.project.logoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={projectImageUrl(entry.project.id, "logo", entry.project.logoKey)}
                    alt=""
                    aria-hidden="true"
                    className="h-8 w-8 shrink-0 rounded-md border bg-background object-contain p-0.5"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-md border bg-muted" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.project.name}</p>
                  {entry.project.subtitle && <p className="truncate text-xs text-muted-foreground">{entry.project.subtitle}</p>}
                </div>
                <Badge variant="outline" className="shrink-0 text-xs">{projectStatusLabel[entry.project.status]}</Badge>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{entry.points}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {ranked.length === 0 && (
        <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum projeto disponível neste recorte.</p>
      )}
    </div>
  )
}
