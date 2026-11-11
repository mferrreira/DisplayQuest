"use client"

import Link from "next/link"
import { Crown, Medal, Award, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { projectStatusLabel } from "@/components/ui/status"
import { BannerImage } from "@/components/ui/banner-image"
import { BucketAvatar } from "@/components/ui/bucket-avatar"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { civilDayOfInstant, monthColumnLabel } from "@/backend/domain"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { rankProjects } from "@/features/projects/utils/project-ranking"
import { projectImageUrl } from "@/lib/api/project-files"
import type { Project, Task, User } from "@/contexts/types"

/**
 * plan-v13 S06 (regra 6) — o leaderboard de projetos da aba Dashboard, completo por pedido do
 * dono em 2026-11-05.
 *
 * O pódio segue o desenho medido da liderança de pessoas (`leaderboard-podium.tsx` do plan-v11):
 * campeão em bloco alto com a capa como moldura, 2º e 3º em cartões com medalha. Abaixo, a
 * "Classificação completa" começa no 4º e é a MESMA peça de tabela da liderança (Posição |
 * Projeto | Progresso | Membros | Pontos) — as duas telas falam a mesma linguagem. Pódio e linhas
 * abrem o detalhe do projeto.
 *
 * Os números que a tela mostra vêm de peças que já existem: o andamento é `projectProgress`
 * (temporal com fallback de tarefas, mesma conta da seção do recorte), a ordenação é
 * `rankProjects` (regra congelada, pontos desc), o período é `monthColumnLabel` (DEC-132: nada
 * de `new Date` em data civil), os avatares dos membros vêm de `users` pelo `userId` do vínculo,
 * o líder é `leaderId` resolvido na mesma lista, e "Seu projeto" é a projeção `isMember` que o
 * servidor já manda.
 */
interface ProjectLeaderboardProps {
  projects: Project[]
  tasks: Task[]
  users: User[]
  onProjectSelect?: (project: Project) => void
}

function getInitials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().substring(0, 2)
}

/**
 * plan-v23 S03 (DEC-266): o pódio de projetos tem ouro, prata e bronze. O campeão usa o
 * token `warning` (dourado) como antes; o 2º leva `silver` e o 3º leva `bronze` — tokens
 * de `globals.css`, nunca valor cru (RF-V6.2 R4). Uma fonte só para as três classes.
 */
const podiumTone: Record<2 | 3, { card: string; accent: string }> = {
  2: { card: "border-silver/40 bg-silver/5", accent: "text-silver" },
  3: { card: "border-bronze/40 bg-bronze/5", accent: "text-bronze" },
}

function periodLabel(project: Project): string | null {
  if (!project.startDate || !project.endDate) return null
  return `${monthColumnLabel(project.startDate.slice(0, 7))} – ${monthColumnLabel(project.endDate.slice(0, 7))}`
}

function memberCountOf(project: Project): number | null {
  return project.memberCount ?? project.members?.length ?? null
}

export function ProjectLeaderboard({ projects, tasks, users, onProjectSelect }: ProjectLeaderboardProps) {
  const ranked = rankProjects(projects)
  const champion = ranked[0]
  const runnersUp = ranked.slice(1, 3)
  const rest = ranked.slice(3)
  const today = civilDayOfInstant(new Date())

  const open = (project: Project) => onProjectSelect?.(project)

  const memberAvatars = (project: Project) =>
    (project.members ?? [])
      .map((member) => users.find((person) => person.id === member.userId) ?? null)
      .filter((person): person is User => person !== null)

  const metaOf = (project: Project) => {
    const progress = projectProgress(project, tasks, today)
    return {
      progress,
      progressLabel: progress.source === "time" ? periodLabel(project) ?? progress.detail : progress.detail,
      leader: project.leaderId != null ? users.find((person) => person.id === project.leaderId) ?? null : null,
      avatars: memberAvatars(project),
      memberCount: memberCountOf(project),
    }
  }

  const progressBlock = (project: Project, className: string) => {
    const meta = metaOf(project)
    return (
      <div className={`space-y-1 ${className}`}>
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{meta.progressLabel}</span>
          <span className="tabular-nums">{meta.progress.percent}%</span>
        </div>
        <Progress
          value={meta.progress.percent}
          className="h-1.5"
          aria-label={`Progresso do projeto ${project.name}: ${meta.progress.percent}%`}
        />
      </div>
    )
  }

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
            className="relative block overflow-hidden rounded-lg border border-warning/40 bg-warning/5 transition-colors hover:border-warning/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {(() => {
              const meta = metaOf(champion.project)
              return (
                <div className="relative flex min-h-[14rem] flex-wrap items-center gap-4 p-6 sm:min-h-[18rem] sm:gap-6 sm:p-10">
                  {champion.project.logoKey ? (
                    // plan-v14 S01 (regra 1): logo do campeão sai pela peça única — o
                    // `object-contain` cru está superado. plan-v23 S03 (DEC-266): o
                    // contêiner do #1 é circular (`rounded-full` com clipping do
                    // `BannerImage`), não mais o quadrado arredondado.
                    <div className="h-16 w-16 shrink-0 rounded-full border border-warning/50 bg-background sm:h-24 sm:w-24">
                      <BannerImage
                        src={projectImageUrl(champion.project.id, "logo", champion.project.logoKey)}
                        alt={champion.project.name}
                        className="rounded-full"
                      />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-warning/50 bg-background sm:h-24 sm:w-24">
                      <Crown className="h-8 w-8 text-warning sm:h-10 sm:w-10" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning">Campeão</p>
                    <p className="break-words text-xl font-bold hyphens-auto text-foreground sm:text-2xl">{champion.project.name}</p>
                    {champion.project.subtitle && <p className="truncate text-sm text-muted-foreground">{champion.project.subtitle}</p>}
                    {progressBlock(champion.project, "mt-2 w-full sm:max-w-xs")}
                    {(meta.avatars.length > 0 || meta.memberCount != null) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {meta.avatars.length > 0 && (
                          <div className="flex -space-x-2">
                            {meta.avatars.slice(0, 3).map((person) => (
                              <BucketAvatar
                                key={person.id}
                                userId={person.id}
                                avatarKey={person.avatarKey}
                                legacyAvatar={person.avatar}
                                name={person.name}
                                className="h-8 w-8 border-2 border-background"
                                fallback={getInitials(person.name)}
                              />
                            ))}
                            {meta.avatars.length > 3 && (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground" aria-hidden="true">
                                +{meta.avatars.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                        {meta.memberCount != null && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {meta.memberCount} {meta.memberCount === 1 ? "membro" : "membros"}
                          </span>
                        )}
                      </div>
                    )}
                    {meta.leader && <p className="mt-2 text-xs text-muted-foreground">Liderado por {meta.leader.name}</p>}
                    {champion.project.isMember && <Badge variant="outline" className="mt-2 text-xs">Seu projeto</Badge>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-4xl font-bold tabular-nums text-foreground sm:text-5xl">{champion.points}</p>
                    <p className="text-xs text-muted-foreground">pontos</p>
                  </div>
                </div>
              )
            })()}
          </Link>
        </section>
      )}

      {runnersUp.length > 0 && (
        <section aria-label="Segundo e terceiro lugares" className="grid gap-4 sm:grid-cols-2">
          {runnersUp.map((entry) => {
            const Icon = entry.position === 2 ? Medal : Award
            const tone = podiumTone[entry.position as 2 | 3]
            const meta = metaOf(entry.project)
            return (
              <Link
                key={entry.project.id}
                href={`/dashboard/projetos/${entry.project.id}`}
                aria-label={`Ver detalhes de ${entry.project.name}`}
                onClick={(event) => {
                  event.preventDefault()
                  open(entry.project)
                }}
                className={`flex items-center gap-4 rounded-lg border ${tone.card} p-4 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <span className={`text-3xl font-bold tabular-nums ${tone.accent}`} aria-hidden="true">{entry.position}º</span>
                {entry.project.logoKey ? (
                  <div className="h-10 w-10 shrink-0 rounded-md border bg-background">
                    <BannerImage
                      src={projectImageUrl(entry.project.id, "logo", entry.project.logoKey)}
                      alt={entry.project.name}
                    />
                  </div>
                ) : (
                  <Icon className={`h-6 w-6 shrink-0 ${tone.accent}`} aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                    <Icon className={`h-4 w-4 shrink-0 ${tone.accent}`} aria-hidden="true" />
                    {entry.project.name}
                  </p>
                  {entry.project.subtitle && <p className="truncate text-xs text-muted-foreground">{entry.project.subtitle}</p>}
                  {meta.memberCount != null && (
                    <p className="truncate text-xs text-muted-foreground">
                      <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                      {meta.memberCount} {meta.memberCount === 1 ? "membro" : "membros"}
                    </p>
                  )}
                  {progressBlock(entry.project, "mt-2")}
                  {entry.project.isMember && <Badge variant="outline" className="mt-2 text-xs">Seu projeto</Badge>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold tabular-nums text-foreground">{entry.points}</p>
                </div>
              </Link>
            )
          })}
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="Classificação completa de projetos" className="space-y-3">
          <h3 className="font-semibold">Classificação completa</h3>
          {/* Espelho da tabela da liderança de pessoas: as mesmas colunas de posição, nome,
              andamento e placar, na peça de tabela que a liderança já usa. Progresso e Membros
              caem abaixo de `sm` pela mesma regra do quadro de pessoas — o número que a tela
              promete é o placar, e ele não pode ficar atrás de rolagem horizontal. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[52px] p-2 sm:w-[80px] sm:p-4">Posição</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead className="hidden sm:table-cell">Progresso</TableHead>
                <TableHead className="hidden sm:table-cell">Membros</TableHead>
                <TableHead className="w-14 text-right">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rest.map((entry) => {
                const meta = metaOf(entry.project)
                return (
                  <TableRow key={entry.project.id} className={entry.project.isMember ? "bg-primary/5" : ""}>
                    <TableCell className="p-2 font-semibold tabular-nums text-muted-foreground sm:p-4">{entry.position}º</TableCell>
                    <TableCell className="p-2 sm:p-4">
                      <Link
                        href={`/dashboard/projetos/${entry.project.id}`}
                        aria-label={`Ver detalhes de ${entry.project.name}`}
                        onClick={(event) => {
                          event.preventDefault()
                          open(entry.project)
                        }}
                        className="flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {entry.project.logoKey ? (
                          <div className="h-9 w-9 shrink-0 rounded-md border bg-background">
                            <BannerImage
                              src={projectImageUrl(entry.project.id, "logo", entry.project.logoKey)}
                              alt={entry.project.name}
                            />
                          </div>
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-medium text-muted-foreground" aria-hidden="true">
                            {getInitials(entry.project.name)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">{entry.project.name}</span>
                            {entry.project.isMember && <Badge variant="outline" className="text-xs">Seu projeto</Badge>}
                          </p>
                          {entry.project.subtitle && <p className="truncate text-xs text-muted-foreground">{entry.project.subtitle}</p>}
                        </div>
                        <Badge variant="outline" className="ml-auto shrink-0 text-xs">{projectStatusLabel[entry.project.status]}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-2 sm:table-cell sm:p-4">
                      {progressBlock(entry.project, "w-28")}
                    </TableCell>
                    <TableCell className="hidden p-2 tabular-nums sm:table-cell sm:p-4">
                      {meta.memberCount != null ? meta.memberCount : "—"}
                    </TableCell>
                    <TableCell className="w-14 p-2 text-right font-bold tabular-nums sm:p-4">{entry.points}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </section>
      )}

      {ranked.length === 0 && (
        <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum projeto disponível neste recorte.</p>
      )}
    </div>
  )
}
