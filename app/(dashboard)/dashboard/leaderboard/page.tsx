"use client"

/**
 * /dashboard/leaderboard — plan-v8 V8-7 (DEC-220).
 *
 * O quadro é o placar do MÊS e a ordem é a régua do servidor (`ListMonthlyRankingUseCase` sobre
 * `rankSeasonStandings`: pontos do mês → tarefas do mês → XP → userId). A versão anterior ordenava a
 * lista de usuários por `points` na tela, que era uma segunda régua dormindo ao lado da primeira: ela
 * empatava onde a régua desempata e não sabia contar tarefa do mês. Hoje a tela mostra as posições que
 * o use case calculou.
 *
 * Mantido do desenho da V6-7: o campeão é a única superfície com tinta, o top 3 é pódio e a
 * "Classificação completa" começa no 4º. As colunas novas (Tarefas do mês, Elo, Troféus, Moedas) vêm
 * todas do mesmo batch de leitura — nada é recalculado aqui (R7).
 *
 * O bloco do livro-caixa (DEC-213) mostra o último ANO FECHADO como ele foi escrito: posição e degrau
 * fotografados pelo fechamento, porque depois da zeragem nenhuma régua viva reconstitui o ano. Lista com
 * teto de altura (`max-h` + `overflow-y-auto`) para o quadro não crescer para fora.
 */
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Award, Coins, Crown, Medal, Sparkles, Zap } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { userImageUrl } from "@/lib/api/user-images"
import { getRoleDisplayName } from "@/lib/utils/access-control"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { GamificationAPI } from "@/contexts/api-client"
import type { MonthlyRanking, MonthlyRankingRow, SeasonBook } from "@/contexts/types"
import { ELO_LABELS, civilMonthLabel, isEloTier } from "@/backend/domain"

export default function LeaderboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [ranking, setRanking] = useState<MonthlyRanking | null>(null)
  const [book, setBook] = useState<SeasonBook | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  useEffect(() => {
    let alive = true
    Promise.all([GamificationAPI.getRanking(), GamificationAPI.getSeasonBook()])
      .then(([rankingResponse, bookResponse]) => {
        if (!alive) return
        setRanking(rankingResponse.ranking ?? null)
        setBook(bookResponse.ledger ?? null)
        setLoadError(null)
      })
      .catch(() => {
        if (alive) setLoadError("Não foi possível carregar o quadro do mês.")
      })
    return () => {
      alive = false
    }
  }, [])

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)

  const getRoleLabel = (roles: string[]) => roles.map(getRoleDisplayName).join(", ")

  const eloLabel = (elo: string) => (isEloTier(elo) ? ELO_LABELS[elo] : elo)

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center p-4 md:p-6">
          <p className="text-muted-foreground">Carregando...</p>
        </main>
      </div>
    )
  }

  if (loadError || !ranking) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="container mx-auto flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            <PageHeader title="Quadro do mês" icon={Zap} />
            <p role="alert" className="text-sm text-destructive">
              {loadError ?? "Quadro indisponível."}
            </p>
          </div>
        </main>
      </div>
    )
  }

  const rows = ranking.rows
  const monthLabel = civilMonthLabel(ranking.month)
  const champion = rows.find((row) => row.position === 1)
  const runnersUp = rows.filter((row) => row.position === 2 || row.position === 3)
  const rest = rows.filter((row) => row.position > 3)
  const mine = rows.find((row) => row.userId === user.id)
  const myPosition = mine?.position ?? 0
  const myPoints = mine?.points ?? 0
  const leaderPoints = champion?.points ?? 0
  const pathPercent =
    leaderPoints > 0 ? Math.max(0, Math.min(100, Math.round((myPoints / leaderPoints) * 100))) : 0
  const rival = myPosition > 1 ? rows.find((row) => row.position === myPosition - 1) : undefined
  const gapToRival = rival ? rival.points - myPoints : 0

  const gapMessage = !mine
    ? "Você ainda não entrou no quadro deste mês."
    : myPosition === 1
      ? "Você lidera o quadro."
      : gapToRival > 0 && rival
        ? `Faltam ${gapToRival} pts para alcançar ${rival.name}.`
        : rival
          ? `Empatado com ${rival.name}.`
          : `Líder: ${champion?.name} com ${leaderPoints} pts.`

  return (
    <div className="flex min-h-screen flex-col">
      <main className="container mx-auto flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <PageHeader
            title={`Quadro de Liderança — ${monthLabel}`}
            description="Placar do mês, na ordem da régua: pontos, tarefas do mês, XP. O mês fecha e recomeça."
            icon={Zap}
          />

          {/* Sua posição — algarismo grande sobre a régua, sem caixa em volta. */}
          <section
            aria-label="Sua posição"
            className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6"
          >
            <div>
              <p className="text-sm text-muted-foreground">Sua posição</p>
              <p className="mt-1 text-5xl font-bold tabular-nums leading-none">
                {myPosition > 0 ? `${myPosition}º` : "—"}
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  de {rows.length}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {myPoints} pontos · {mine?.monthTasks ?? 0}{" "}
                {(mine?.monthTasks ?? 0) === 1 ? "tarefa" : "tarefas"} no mês · XP {mine?.xp ?? 0} (temporada) · elo{" "}
                {mine ? eloLabel(mine.elo) : "—"}
              </p>
            </div>
            <div className="w-full max-w-sm">
              <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
                <span>Seu progresso até o topo</span>
                <span className="tabular-nums">{pathPercent}%</span>
              </div>
              <Progress
                value={pathPercent}
                className="h-2"
                aria-label={`Progresso até o líder do quadro: ${pathPercent}%`}
              />
              <p className="mt-2 text-xs text-muted-foreground">{gapMessage}</p>
            </div>
          </section>

          {champion && (
            <section aria-label="Campeão do mês">
              <Link
                href={`/dashboard/profile?userId=${champion.userId}`}
                className="relative block overflow-hidden rounded-2xl border border-warning/30 bg-warning/5 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* V5-3 (DEC-137): a capa do 1º lugar entra como fundo translúcido do bloco. */}
                {champion.bannerKey ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={userImageUrl(champion.userId, "banner", champion.bannerKey)}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-cover opacity-20"
                    />
                  </>
                ) : null}
                <div className="relative flex flex-wrap items-center gap-6 p-8">
                  <Crown className="h-10 w-10 shrink-0 text-warning" aria-hidden="true" />
                  <Avatar className="h-20 w-20 border-2 border-warning/50">
                    <AvatarImage src={champion.avatar || undefined} alt={champion.name} />
                    <AvatarFallback className="text-xl font-bold">{getInitials(champion.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning">1º lugar</p>
                    <p className="truncate text-2xl font-bold text-foreground">{champion.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {getRoleLabel(champion.roles || []) || "Membro do laboratório"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-bold tabular-nums text-foreground">{champion.points}</p>
                    <p className="text-xs text-muted-foreground">pontos no mês</p>
                  </div>
                </div>
              </Link>
            </section>
          )}

          {runnersUp.length > 0 && (
            <section
              aria-label="Segundo e terceiro lugares"
              className="grid gap-8 sm:grid-cols-2 sm:divide-x sm:divide-border"
            >
              {runnersUp.map((runnerUp) => {
                const Icon = runnerUp.position === 2 ? Medal : Award
                const accent = runnerUp.position === 2 ? "text-muted-foreground" : "text-warning"
                return (
                  <Link
                    key={runnerUp.userId}
                    href={`/dashboard/profile?userId=${runnerUp.userId}`}
                    className={`flex items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      runnerUp.position === 2 ? "sm:pr-8" : "sm:pl-8"
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
                    <p className="shrink-0 font-bold tabular-nums text-foreground">{runnerUp.points}</p>
                  </Link>
                )
              })}
            </section>
          )}

          <section aria-labelledby="leaderboard-full" className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="leaderboard-full" className="text-sm font-semibold">
                Classificação completa
              </h2>
              <p className="text-xs text-muted-foreground">Clique em qualquer usuário para abrir o perfil.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[72px]">Posição</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-right">Pontos</TableHead>
                  <TableHead className="text-right">Tarefas (mês)</TableHead>
                  <TableHead>Elo</TableHead>
                  <TableHead className="text-right">Troféus</TableHead>
                  <TableHead className="text-right">Moedas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* O top 3 ja esta no podio (campeao + 2º/3º) — a tabela comeca no 4º. */}
                {rest.map((row) => (
                  <TableRow key={row.userId} className={row.userId === user.id ? "bg-primary/5" : ""}>
                    <TableCell className="font-semibold tabular-nums text-muted-foreground">{row.position}º</TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/profile?userId=${row.userId}`}
                        className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/60"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={row.avatar || undefined} alt={row.name} />
                          <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{getRoleLabel(row.roles || [])}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{row.points}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{row.monthTasks}</TableCell>
                    <TableCell className="text-muted-foreground">{eloLabel(row.elo)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.trophiesEquipped}
                      <span className="text-muted-foreground"> / {row.trophiesTotal}</span>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      <Coins className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                      {row.coins}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <SeasonBookBlock book={book} />
        </div>
      </main>
    </div>
  )
}

/**
 * O livro-caixa da temporada (DEC-213): o último ano fechado como ele foi escrito pelo
 * `CloseSeasonUseCase`. Depois da zeragem de `points`/`xp`, a posição e o degrau do ano só existem ali —
 * é por isso que a tela lê o registro em vez de reconstar a régua sobre o saldo (que agora é zero).
 */
function SeasonBookBlock({ book }: { book: SeasonBook | null }) {
  if (!book || book.year === null) {
    return (
      <section aria-labelledby="season-book" className="space-y-3">
        <h2 id="season-book" className="text-sm font-semibold">
          Livro-caixa da temporada
        </h2>
        <p className="text-xs text-muted-foreground">
          Nenhum ano fechado ainda. A temporada fecha em 1º de janeiro, depois do fechamento do mês de
          dezembro.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="season-book" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="season-book" className="text-sm font-semibold">
          Livro-caixa da temporada {book.year}
        </h2>
        <p className="text-xs text-muted-foreground">
          Posição e elo do ano que fechou — os números fotografados no fechamento.
        </p>
      </div>
      <div className="relative max-h-80 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[72px]">Posição</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="text-right">Pontos</TableHead>
              <TableHead className="text-right">Tarefas</TableHead>
              <TableHead className="text-right">
                <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                XP
              </TableHead>
              <TableHead>Elo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {book.standings.map((standing) => (
              <TableRow key={standing.userId}>
                <TableCell className="font-semibold tabular-nums text-muted-foreground">
                  {standing.position ?? "—"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/profile?userId=${standing.userId}`}
                    className="rounded-lg p-1 transition-colors hover:bg-muted/60"
                  >
                    <p className="font-medium">{standing.name}</p>
                  </Link>
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">{standing.points}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{standing.completedTasks}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{standing.xp}</TableCell>
                <TableCell className="text-muted-foreground">
                  {standing.elo ? (isEloTier(standing.elo) ? ELO_LABELS[standing.elo] : standing.elo) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
