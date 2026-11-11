"use client"

/**
 * /dashboard/leaderboard — plan-v6 · V6-7 (Perfil + Ranking), plan-v9 S01 e S03.
 *
 * Reimaginacao: o ranking nao e uma grade de caixas. A posicao pessoal e um bloco aberto (algarismo
 * grande + fio de progresso), o campeao e a unica superficie com tinta (o ouro tem significado), o
 * 2º/3º sao colunas tipograficas e a classificacao e uma tabela solta — sem `Card` em volta de nada.
 * Os dados sao os que a tela ja carrega (`useUser`); nenhuma busca nova entra aqui, exceto a
 * leitura de um mes fechado, que so acontece quando a pessoa abre um mes fechado no seletor.
 *
 * S03 (MODELO §7, CA4, CA8): o seletor de mes troca o quadro para as linhas congeladas do
 * fechamento. Mês fechado é só leitura, diz que está fechado, e o bloco pessoal sai dali — progresso
 * contra o líder de hoje não existe num mês que já fechou.
 *
 * plan-v18 S03 (DEC-249, ADR-006) + plan-v23 S02 (DEC-265): a rota tem três abas, na ordem
 * Pessoas > Projetos > Temporada, com Pessoas abrindo por padrão. Conteúdos intactos: o
 * `ProjectManagerDashboard` na aba Projetos, o ranking de hoje na aba Pessoas e o quadro do
 * ano na aba Temporada. As três abas são abertas a todo autenticado.
 */
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Award, Crown, Medal, TrendingUp, Trophy } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BucketAvatar } from "@/components/ui/bucket-avatar"
import { Button } from "@/components/ui/button"
import { getRoleDisplayName } from "@/lib/utils/access-control"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchAPI } from "@/contexts/api-client"
import { userImageUrl } from "@/lib/api/user-images"
import { BannerImage } from "@/components/ui/banner-image"
import { compareByBoardPosition, compareBySeasonPosition } from "@/backend/domain"

/** O que `GET /api/board` declara (S01: mês corrente; S03 acrescenta a lista de meses fechados). */
interface BoardMonth {
  month: string
  monthLabel: string
  closedMonths?: Array<{ month: string; monthLabel: string }>
  /** plan-v20 S02 (DEC-255): o ano em curso e as temporadas fechadas, declarados pelo servidor. */
  seasonYear?: string
  closedSeasons?: Array<{ year: string; yearLabel: string }>
}

/** O que `GET /api/board?year=AAAA` devolve (S02, espelho de CA4/CA8 do mês). */
interface SeasonBoardRead {
  year: string
  yearLabel: string
  track: string
  closed: boolean
  live: boolean
  notice: string
  entries: Array<{ userId: number; name: string; value: number; position: number }>
}

/** O que `GET /api/board?month=AAAA-MM` devolve (S03, CA4, CA8, R9). */
interface BoardMonthRead {
  month: string
  monthLabel: string
  closed: boolean
  /** true quando o mês pedido é o em curso: o quadro se resolve pelo placar vivo (R9). */
  live: boolean
  notice: string
  entries: Array<{
    userId: number
    name: string
    value: number
    position: number
  }>
}

/** Linha do quadro, vinda do placar vivo ou de um fechamento. A tela renderiza as duas iguais. */
interface BoardEntry {
  id: number
  name: string
  value: number
  position: number
  avatar?: string | null
  bannerKey?: string | null
  /** plan-v14 S02 (regra 2): chave do avatar no bucket (DEC-242). */
  avatarKey?: string | null
  roles?: string[]
  completedTasks?: number
}

/** Sentinela da casa para "sem mês escolhido": o quadro vivo. Nunca `""` (Select do Radix). */
const CURRENT_MONTH = "current"

/** plan-v20 S02 (DEC-255): sentinela do ano em curso, mesma forma da sentinela do mês. */
const CURRENT_SEASON = "current"

export default function LeaderboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { users } = useUser()
  const { projects } = useProject()
  const { tasks } = useTask()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  // plan-v9 S01 (R4, DEC-132): o mês é declarado pelo servidor. Calcular mês no navegador é o erro
  // que a casa já fechou — `new Date("2026-10")` é UTC e o rótulo viraria setembro no fuso local.
  const [boardMonth, setBoardMonth] = useState<BoardMonth | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(CURRENT_MONTH)
  const [closedBoard, setClosedBoard] = useState<BoardMonthRead | null>(null)
  const [closedBoardError, setClosedBoardError] = useState(false)
  // A falha de leitura promete "tente de novo", então o retry tem que existir na tela: é uma
  // contagem de tentativa, não um segundo caminho de leitura.
  const [readAttempt, setReadAttempt] = useState(0)

  // plan-v20 S02 (DEC-255): a aba Temporada. Em curso, o quadro é o SALDO da base (`points`),
  // pela MESMA régua do quadro (DEC-253). Fechada, a leitura do ano congela as linhas — os mesmos
  // três estados da leitura de mês (pendente, falha, pronto), espelhados.
  const [selectedSeason, setSelectedSeason] = useState<string>(CURRENT_SEASON)
  const [closedSeason, setClosedSeason] = useState<SeasonBoardRead | null>(null)
  const [closedSeasonError, setClosedSeasonError] = useState(false)
  const [seasonAttempt, setSeasonAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchAPI<BoardMonth>("/api/board")
      .then((month) => {
        if (!cancelled) setBoardMonth(month)
      })
      .catch(() => {
        if (!cancelled) setBoardMonth(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // S03: a leitura do mês fechado só acontece quando a pessoa abre um mês fechado. O quadro vivo
  // nunca é recalculado por ela (CA4). O estado da leitura é declarado — carregando, falha, pronto
  // — porque cair no quadro do mês em curso quando a leitura falhou é exatamente o defeito que a
  // CA4 e a CA8 existem para pegar.
  useEffect(() => {
    if (selectedMonth === CURRENT_MONTH) {
      setClosedBoard(null)
      setClosedBoardError(false)
      return
    }
    let cancelled = false
    setClosedBoard(null)
    setClosedBoardError(false)
    fetchAPI<BoardMonthRead>(`/api/board?month=${selectedMonth}`)
      .then((board) => {
        if (!cancelled) setClosedBoard(board)
      })
      .catch(() => {
        if (!cancelled) {
          setClosedBoard(null)
          setClosedBoardError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedMonth, readAttempt])

  // plan-v20 S02: a leitura de um ano fechado só acontece quando a pessoa abre um ano fechado.
  useEffect(() => {
    if (selectedSeason === CURRENT_SEASON) {
      setClosedSeason(null)
      setClosedSeasonError(false)
      return
    }
    let cancelled = false
    setClosedSeason(null)
    setClosedSeasonError(false)
    fetchAPI<SeasonBoardRead>(`/api/board?year=${selectedSeason}`)
      .then((season) => {
        if (!cancelled) setClosedSeason(season)
      })
      .catch(() => {
        if (!cancelled) {
          setClosedSeason(null)
          setClosedSeasonError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedSeason, seasonAttempt])

  // plan-v9 (ADR-001, DEC-224): o quadro ordena pelo placar do mês. `points` é saldo e não decide ordem.
  const monthScore = (candidate: { currentMonthPoints?: number }) =>
    candidate.currentMonthPoints ?? 0

  // plan-v9 S04 (ADR-005, DEC-227): o vivo desempata com a MESMA régua do fechado — valor desc,
  // depois nome, depois id. Antes, empate ficava na ordem de chegada da lista e vivo e fechado
  // diziam ordens diferentes com o mesmo placar.
  const sortedUsers = [...users].sort((left, right) =>
    compareByBoardPosition(
      {
        id: left.id,
        name: left.name,
        currentMonthPoints: left.currentMonthPoints ?? 0,
      },
      {
        id: right.id,
        name: right.name,
        currentMonthPoints: right.currentMonthPoints ?? 0,
      },
    ),
  )

  // plan-v20 S02 (DEC-253): a temporada ordena pelo SALDO, com a MESMA régua do quadro. Em curso,
  // a tela usa a base viva; fechada, as linhas do ano congelado.
  const seasonSortedUsers = [...users].sort((left, right) =>
    compareBySeasonPosition(
      { id: left.id, name: left.name, currentSeasonPoints: left.points ?? 0 },
      { id: right.id, name: right.name, currentSeasonPoints: right.points ?? 0 },
    ),
  )

  const currentUserIndex = sortedUsers.findIndex(
    (rankedUser) => rankedUser.id === user?.id,
  )
  const currentUserRank = currentUserIndex + 1
  // A pessoa tambem sai da lista que o quadro ordena: a sessao ainda carrega o saldo, e o bloco
  // pessoal precisa do placar do mes (o passo de levar o placar ate a sessao e a S06).
  const myEntry = currentUserIndex >= 0 ? sortedUsers[currentUserIndex] : user

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)

  const getRoleLabel = (roles: string[]) =>
    roles.map(getRoleDisplayName).join(", ")

  // Uma leitura de mês nomeado só congela o quadro quando o servidor devolve linhas de fechamento.
  // `live` (R9) e falha de leitura não congelam: o quadro é o de hoje, declarado como tal.
  const selectedClosedMonth =
    selectedMonth !== CURRENT_MONTH &&
    closedBoard !== null &&
    closedBoard.closed &&
    !closedBoard.live
  const closedBoardFailed = selectedMonth !== CURRENT_MONTH && closedBoardError
  const closedBoardPending =
    selectedMonth !== CURRENT_MONTH && closedBoard === null && !closedBoardError
  const closedBoardReady = selectedClosedMonth && closedBoard !== null

  // Uma lista só, duas origens. No mês fechado o valor e a posição vêm da linha gravada; o avatar,
  // a capa e as tarefas vêm da conta de hoje, quando ela ainda existe (`month_history` cascadeia).
  const entries: BoardEntry[] = closedBoardReady
    ? closedBoard.entries.map((entry) => {
        const account = users.find((candidate) => candidate.id === entry.userId)
        return {
          id: entry.userId,
          name: entry.name,
          value: entry.value,
          position: entry.position,
          avatar: account?.avatar,
          bannerKey: account?.bannerKey,
          avatarKey: account?.avatarKey,
          roles: account?.roles,
          completedTasks: account?.completedTasks,
        }
      })
    : sortedUsers.map((rankedUser, index) => ({
        id: rankedUser.id,
        name: rankedUser.name,
        value: monthScore(rankedUser),
        position: index + 1,
        avatar: rankedUser.avatar,
        bannerKey: rankedUser.bannerKey,
        avatarKey: rankedUser.avatarKey,
        roles: rankedUser.roles,
        completedTasks: rankedUser.completedTasks,
      }))

  const seasonEntries: BoardEntry[] =
    closedSeason !== null && closedSeason.closed && !closedSeason.live
      ? closedSeason.entries.map((entry) => {
          const account = users.find((candidate) => candidate.id === entry.userId)
          return {
            id: entry.userId,
            name: entry.name,
            value: entry.value,
            position: entry.position,
            avatar: account?.avatar,
            bannerKey: account?.bannerKey,
            avatarKey: account?.avatarKey,
            roles: account?.roles,
            completedTasks: account?.completedTasks,
          }
        })
      : seasonSortedUsers.map((rankedUser, index) => ({
          id: rankedUser.id,
          name: rankedUser.name,
          value: rankedUser.points ?? 0,
          position: index + 1,
          avatar: rankedUser.avatar,
          bannerKey: rankedUser.bannerKey,
          avatarKey: rankedUser.avatarKey,
          roles: rankedUser.roles,
          completedTasks: rankedUser.completedTasks,
        }))

  const seasonSelectedClosed =
    selectedSeason !== CURRENT_SEASON &&
    closedSeason !== null &&
    closedSeason.closed &&
    !closedSeason.live
  const seasonClosedReady = seasonSelectedClosed && closedSeason !== null
  const seasonPending =
    selectedSeason !== CURRENT_SEASON && closedSeason === null && !closedSeasonError
  const seasonFailed = selectedSeason !== CURRENT_SEASON && closedSeasonError

  const leader = entries[0]
  const leaderPoints = leader ? leader.value : 0
  const myPoints = myEntry ? monthScore(myEntry) : 0
  const pathPercent =
    leaderPoints > 0
      ? Math.max(0, Math.min(100, Math.round((myPoints / leaderPoints) * 100)))
      : 0
  const rival =
    currentUserRank > 1 ? sortedUsers[currentUserRank - 2] : undefined
  const gapToRival = rival ? monthScore(rival) - myPoints : 0

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center p-4 md:p-6">
          <p className="text-muted-foreground">Carregando...</p>
        </main>
      </div>
    )
  }

  const gapMessage =
    currentUserRank === 1
      ? "Você lidera o quadro."
      : gapToRival > 0 && rival
        ? `Faltam ${gapToRival} pontos para alcançar ${rival.name}.`
        : rival
          ? `Empatado com ${rival.name}.`
          : `Líder: ${leader?.name} com ${leaderPoints} pontos.`

  const podiumUsers = entries.slice(0, 3)
  const remainingUsers = entries.slice(3)
  const champion = podiumUsers[0]
  const runnersUp = podiumUsers.slice(1)
  const currentBoardEmpty =
    !closedBoardReady && entries.every((entry) => entry.value === 0)

  const monthSelector = (
    <Select
      value={selectedMonth}
      onValueChange={(value) => setSelectedMonth(value)}
    >
      <SelectTrigger
        className="w-[190px] sm:w-[220px]"
        aria-label="Mês do quadro"
      >
        <SelectValue placeholder="mês em curso" />
      </SelectTrigger>
      <SelectContent>
        {/* O rotulo do mes em curso ja esta no cabecalho da tela. Nomea-lo outra vez aqui duplicaria
            o mesmo texto no DOM e quebraria a leitura de quem procura o mes uma unica vez. */}
        <SelectItem value={CURRENT_MONTH}>mês em curso</SelectItem>
        {(boardMonth?.closedMonths ?? []).map((closedMonth) => (
          <SelectItem key={closedMonth.month} value={closedMonth.month}>
            {closedMonth.monthLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // plan-v20 S02 (DEC-255): o seletor de ano da aba Temporada. Os anos vêm do servidor
  // (`seasonYear` + `closedSeasons`); a tela não deduz anos, porque calcular ano no navegador
  // desloca a virada no fuso do laboratório (DEC-132).
  const seasonSelector = (
    <Select value={selectedSeason} onValueChange={(value) => setSelectedSeason(value)}>
      <SelectTrigger
        className="w-[190px] sm:w-[220px]"
        aria-label="Ano da temporada"
      >
        <SelectValue placeholder="temporada em curso" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CURRENT_SEASON}>temporada em curso</SelectItem>
        {(boardMonth?.closedSeasons ?? []).map((closedSeasonEntry) => (
          <SelectItem key={closedSeasonEntry.year} value={closedSeasonEntry.year}>
            {closedSeasonEntry.yearLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const seasonYearLabel =
    closedSeason?.yearLabel ??
    (boardMonth?.closedSeasons ?? []).find(
      (seasonEntry) => seasonEntry.year === selectedSeason,
    )?.yearLabel ??
    selectedSeason
  const seasonDescription = seasonClosedReady
    ? closedSeason.entries.length > 0
      ? closedSeason.notice
      : `Fechamento da ${seasonYearLabel}.`
    : seasonPending
      ? `Lendo o fechamento da ${seasonYearLabel}.`
      : seasonFailed
        ? `Temporada pedida: ${seasonYearLabel}.`
        : boardMonth?.seasonYear
          ? `Placar da temporada ${boardMonth.seasonYear} em curso. Abra o perfil de cada pessoa.`
          : "Placar da temporada em curso. Abra o perfil de cada pessoa."


  // O aviso do mês tem um ramo por estado da leitura, e nenhum deles nomeia o mês errado: pendant
  // o mês em curso, na falha e no vazio o mês pedido. Dizer "Placar de outubro de 2026" enquanto o
  // quadro embaixo lê junho de 2027 é a mesma mentira que a CA4 e a CA8 existem para pegar.
  // `month_history` nao guarda mes em texto por pessoa: o rotulo vem do servidor. Na falha de
  // leitura o que resta e o rotulo da lista de meses fechados, nunca o `AAAA-MM` cru.
  const closedMonthLabel =
    closedBoard?.monthLabel ??
    boardMonth?.closedMonths?.find(
      (closedMonth) => closedMonth.month === selectedMonth,
    )?.monthLabel ??
    selectedMonth
  const monthDescription = closedBoardReady
    ? closedBoard.entries.length > 0
      ? closedBoard.notice
      : `Fechamento de ${closedMonthLabel}.`
    : closedBoardPending
      ? `Lendo o fechamento de ${closedMonthLabel}.`
      : closedBoardFailed
        ? `Mês fechado: ${closedMonthLabel}.`
        : boardMonth
          ? `Placar de ${boardMonth.monthLabel}. Abra o perfil de cada pessoa.`
          : "Placar do mês em curso. Abra o perfil de cada pessoa."

  return (
    <div className="flex min-h-screen flex-col">
      <main className="container mx-auto flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* plan-v23 S02 (DEC-265): a ordem das abas é Pessoas > Projetos > Temporada e
              Pessoas é a default — o pedido do dono de 2026-11-11. Os conteúdos das três
              abas ficam intactos (DEC-249/255): só a ordem e a aba de abertura mudam. */}
          <Tabs defaultValue="pessoas" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pessoas" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Pessoas
              </TabsTrigger>
              <TabsTrigger value="projetos" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Projetos
              </TabsTrigger>
              <TabsTrigger value="temporada" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Temporada
              </TabsTrigger>
            </TabsList>

            <TabsContent value="projetos">
              <ProjectManagerDashboard
                projects={projects}
                tasks={tasks}
                users={users}
                scopeDescription="Todos os projetos"
                onProjectSelect={(project) =>
                  router.push(`/dashboard/projetos/${project.id}`)
                }
              />
            </TabsContent>

            {/* plan-v20 S02 (DEC-255): a aba Temporada, entre Projetos e Pessoas. Em curso, o
                pódio e a tabela são pelo SALDO acumulado da pessoa (`users.points`) — a
                temporada é o conjunto dos 12 quadros do ano, e o número que aDEC-253 nomeia é o
                saldo no instante. Fechada, a leitura do ano congela valor e posição, com os
                mesmos estados de leitura da aba Pessoas. */}
            <TabsContent value="temporada" className="space-y-8">
              <PageHeader
                title="Temporada"
                description={seasonDescription}
                icon={Trophy}
                actions={seasonSelector}
              />

              {seasonClosedReady && seasonEntries.length === 0 ? (
                <div role="status">
                  <EmptyState
                    icon={Trophy}
                    title="Quadro vazio"
                    description={closedSeason.notice}
                    className="rounded-lg border border-dashed border-border"
                  />
                </div>
              ) : seasonPending ? (
                <section
                  aria-label="Quadro da temporada fechada"
                  role="status"
                  className="rounded-lg border border-dashed border-border p-10 text-center"
                >
                  <p className="text-muted-foreground">
                    Lendo o quadro fechado da {seasonYearLabel}...
                  </p>
                </section>
              ) : seasonFailed ? (
                <div role="alert">
                  <EmptyState
                    icon={Trophy}
                    title="Quadro indisponível"
                    description={`Não foi possível ler o quadro da ${seasonYearLabel}. A temporada fechada não muda.`}
                    className="rounded-lg border border-dashed border-border"
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSeasonAttempt((attempt) => attempt + 1)}
                      >
                        Tentar de novo
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div
                  role={seasonClosedReady ? "status" : undefined}
                  aria-label={seasonClosedReady ? "Quadro da temporada fechada" : undefined}
                  className="space-y-8"
                >
                  {seasonEntries[0] && (
                    <section aria-label="Campeão da temporada">
                      <Link
                        href={`/dashboard/profile?userId=${seasonEntries[0].id}`}
                        className="relative block overflow-hidden rounded-2xl border border-warning/30 bg-warning/5 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {seasonEntries[0].bannerKey ? (
                          <div className="absolute inset-0 opacity-20" aria-hidden="true">
                            <BannerImage
                              src={userImageUrl(
                                seasonEntries[0].id,
                                "banner",
                                seasonEntries[0].bannerKey,
                              )}
                              alt=""
                            />
                          </div>
                        ) : null}
                        <div className="relative flex flex-wrap items-center gap-6 p-8">
                          <Crown className="h-10 w-10 shrink-0 text-warning" aria-hidden="true" />
                          <BucketAvatar
                            userId={seasonEntries[0].id}
                            avatarKey={seasonEntries[0].avatarKey}
                            legacyAvatar={seasonEntries[0].avatar}
                            name={seasonEntries[0].name}
                            className="h-20 w-20 border-2 border-warning/50"
                            fallback={getInitials(seasonEntries[0].name)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                              1º lugar
                            </p>
                            <p className="truncate text-2xl font-bold text-foreground">
                              {seasonEntries[0].name}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {getRoleLabel(seasonEntries[0].roles || []) ||
                                "Membro do laboratório"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-4xl font-bold tabular-nums text-foreground">
                              {seasonEntries[0].value}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              pontos da temporada
                            </p>
                          </div>
                        </div>
                      </Link>
                    </section>
                  )}

                  {seasonEntries.slice(1, 3).length > 0 && (
                    <section
                      aria-label="Segundo e terceiro lugares"
                      className="grid gap-8 sm:grid-cols-2 sm:divide-x sm:divide-border"
                    >
                      {seasonEntries.slice(1, 3).map((runnerUp) => {
                        const Icon = runnerUp.position === 2 ? Medal : Award
                        const accent =
                          runnerUp.position === 2
                            ? "text-muted-foreground"
                            : "text-warning"
                        return (
                          <Link
                            key={runnerUp.id}
                            href={`/dashboard/profile?userId=${runnerUp.id}`}
                            className={`flex items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              runnerUp.position === 2 ? "sm:pr-8" : "sm:pl-8"
                            }`}
                          >
                            <span
                              className={`text-3xl font-bold tabular-nums ${accent}`}
                              aria-hidden="true"
                            >
                              {runnerUp.position}º
                            </span>
                            <BucketAvatar
                              userId={runnerUp.id}
                              avatarKey={runnerUp.avatarKey}
                              legacyAvatar={runnerUp.avatar}
                              name={runnerUp.name}
                              className="h-12 w-12"
                              fallback={getInitials(runnerUp.name)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                                <Icon
                                  className={`h-4 w-4 shrink-0 ${accent}`}
                                  aria-hidden="true"
                                />
                                {runnerUp.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {getRoleLabel(runnerUp.roles || []) ||
                                  "Membro do laboratório"}
                              </p>
                            </div>
                            <p className="shrink-0 font-bold tabular-nums text-foreground">
                              {runnerUp.value}
                            </p>
                          </Link>
                        )
                      })}
                    </section>
                  )}

                  <section
                    aria-labelledby="season-full"
                    className="space-y-4"
                  >
                    <h2 id="season-full" className="text-sm font-semibold">
                      Classificação completa
                    </h2>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[52px] p-2 sm:w-[80px] sm:p-4">
                            Posição
                          </TableHead>
                          <TableHead>Usuário</TableHead>
                          <TableHead className="hidden sm:table-cell">
                            Tarefas cumulativas
                          </TableHead>
                          <TableHead className="text-right">
                            Pontos da temporada
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {seasonEntries.slice(3).map((rankedUser) => (
                          <TableRow
                            key={rankedUser.id}
                            className={
                              rankedUser.id === user.id ? "bg-primary/5" : ""
                            }
                          >
                            <TableCell className="p-2 font-semibold tabular-nums text-muted-foreground sm:p-4">
                              {rankedUser.position}º
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/dashboard/profile?userId=${rankedUser.id}`}
                                className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <BucketAvatar
                                  userId={rankedUser.id}
                                  avatarKey={rankedUser.avatarKey}
                                  legacyAvatar={rankedUser.avatar}
                                  name={rankedUser.name}
                                  className="h-9 w-9"
                                  fallback={getInitials(rankedUser.name)}
                                />
                                <div>
                                  <p className="font-medium">{rankedUser.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {getRoleLabel(rankedUser.roles || [])}
                                  </p>
                                </div>
                              </Link>
                            </TableCell>
                            <TableCell className="hidden p-2 tabular-nums sm:table-cell sm:p-4">
                              {rankedUser.completedTasks ?? "—"}
                            </TableCell>
                            <TableCell className="p-2 text-right font-bold tabular-nums sm:p-4">
                              {rankedUser.value}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pessoas" className="space-y-8">
              <PageHeader
                title="Quadro de Liderança"
                description={monthDescription}
                icon={Trophy}
                actions={monthSelector}
              />

              {/* Sua posição — só no mês em curso. Mês fechado não tem progresso contra o líder de hoje. */}
              {!closedBoardReady &&
                !closedBoardPending &&
                !closedBoardFailed &&
                !currentBoardEmpty && (
                  <section
                    aria-label="Sua posição"
                    className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6"
                  >
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Sua posição
                      </p>
                      <p className="mt-1 text-5xl font-bold tabular-nums leading-none">
                        {currentUserRank > 0 ? `${currentUserRank}º` : "—"}
                        <span className="ml-2 text-base font-normal text-muted-foreground">
                          de {sortedUsers.length}
                        </span>
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {myPoints} pontos · {user.completedTasks}{" "}
                        {user.completedTasks === 1 ? "tarefa" : "tarefas"}{" "}
                        concluídas
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
                      <p className="mt-2 text-xs text-muted-foreground">
                        {gapMessage}
                      </p>
                    </div>
                  </section>
                )}

              {/* CA8: mês sem fechamento, ou fechado sem linha, é quadro vazio com aviso. Os três
                estados da leitura têm papel vivo: trocar o mês troca o texto, e quem usa leitor de
                tela precisa ouvir a troca, não só ver o quadro antigo sumir. */}
              {closedBoardReady && entries.length === 0 ? (
                <div role="status">
                  <EmptyState
                    icon={Trophy}
                    title="Quadro vazio"
                    description={closedBoard.notice}
                    className="rounded-lg border border-dashed border-border"
                  />
                </div>
              ) : closedBoardPending ? (
                // O mês nomeado é registro congelado: enquanto a leitura não chega, a tela não mostra
                // o quadro de hoje no lugar dele.
                <section
                  aria-label="Quadro do mês fechado"
                  role="status"
                  className="rounded-lg border border-dashed border-border p-10 text-center"
                >
                  <p className="text-muted-foreground">
                    Lendo o quadro fechado de {closedMonthLabel}...
                  </p>
                </section>
              ) : closedBoardFailed ? (
                <div role="alert">
                  <EmptyState
                    icon={Trophy}
                    title="Quadro indisponível"
                    description={`Não foi possível ler o quadro de ${closedMonthLabel}. O mês fechado não muda.`}
                    className="rounded-lg border border-dashed border-border"
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReadAttempt((attempt) => attempt + 1)}
                      >
                        Tentar de novo
                      </Button>
                    }
                  />
                </div>
              ) : currentBoardEmpty ? (
                <EmptyState
                  icon={Trophy}
                  title="Quadro vazio"
                  description="Ainda não há pontos no placar deste mês."
                  className="rounded-lg border border-dashed border-border"
                />
              ) : (
                // Quadro vivo e fechado-com-linhas dividem o mesmo corpo. No fechado o wrapper é região
                // viva (role="status"): trocar de mês precisa ser anunciado também quando há linhas —
                // pending, fail e vazio já o têm. O "space-y-8" sobe para o wrapper para o ritmo entre
                // campeão, 2º/3º e tabela não mudar em nenhum dos dois caminhos.
                <div
                  role={closedBoardReady ? "status" : undefined}
                  aria-label={
                    closedBoardReady ? "Quadro do mês fechado" : undefined
                  }
                  className="space-y-8"
                >
                  {/* Dono (2026-10-29, veredito): a forma antiga é a que fica. O campeão volta a ser a
                    única superfície com tinta (ouro) — bloco grande com a capa de fundo — e o 2º/3º
                    voltam a colunas tipográficas com Medal/Award. A Lógica do mês (placar, seletor,
                    posição do fechamento) fica intacta: `value` é o placar, `position` a linha gravada. */}
                  {champion && (
                    <section aria-label="Campeão do quadro">
                      <Link
                        href={`/dashboard/profile?userId=${champion.id}`}
                        className="relative block overflow-hidden rounded-2xl border border-warning/30 bg-warning/5 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {champion.bannerKey ? (
                          // plan-v12 (DEC-239): a peça única `BannerImage` no bloco do campeão — a faixa
                          // translúcida é cover simples.
                          <div
                            className="absolute inset-0 opacity-20"
                            aria-hidden="true"
                          >
                            <BannerImage
                              src={userImageUrl(
                                champion.id,
                                "banner",
                                champion.bannerKey,
                              )}
                              alt=""
                            />
                          </div>
                        ) : null}
                        <div className="relative flex flex-wrap items-center gap-6 p-8">
                          <Crown
                            className="h-10 w-10 shrink-0 text-warning"
                            aria-hidden="true"
                          />
                          {/* plan-v14 S02 (regra 2): avatar pela peça única. */}
                          <BucketAvatar
                            userId={champion.id}
                            avatarKey={champion.avatarKey}
                            legacyAvatar={champion.avatar}
                            name={champion.name}
                            className="h-20 w-20 border-2 border-warning/50"
                            fallback={getInitials(champion.name)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                              1º lugar
                            </p>
                            <p className="truncate text-2xl font-bold text-foreground">
                              {champion.name}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {getRoleLabel(champion.roles || []) ||
                                "Membro do laboratório"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-4xl font-bold tabular-nums text-foreground">
                              {champion.value}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              pontos do mês
                            </p>
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
                        const accent =
                          runnerUp.position === 2
                            ? "text-muted-foreground"
                            : "text-warning"
                        return (
                          <Link
                            key={runnerUp.id}
                            href={`/dashboard/profile?userId=${runnerUp.id}`}
                            className={`flex items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              runnerUp.position === 2 ? "sm:pr-8" : "sm:pl-8"
                            }`}
                          >
                            <span
                              className={`text-3xl font-bold tabular-nums ${accent}`}
                              aria-hidden="true"
                            >
                              {runnerUp.position}º
                            </span>
                            <BucketAvatar
                              userId={runnerUp.id}
                              avatarKey={runnerUp.avatarKey}
                              legacyAvatar={runnerUp.avatar}
                              name={runnerUp.name}
                              className="h-12 w-12"
                              fallback={getInitials(runnerUp.name)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                                <Icon
                                  className={`h-4 w-4 shrink-0 ${accent}`}
                                  aria-hidden="true"
                                />
                                {runnerUp.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {getRoleLabel(runnerUp.roles || []) ||
                                  "Membro do laboratório"}
                              </p>
                            </div>
                            <p className="shrink-0 font-bold tabular-nums text-foreground">
                              {runnerUp.value}
                            </p>
                          </Link>
                        )
                      })}
                    </section>
                  )}

                  <section
                    aria-labelledby="leaderboard-full"
                    className="space-y-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2
                        id="leaderboard-full"
                        className="text-sm font-semibold"
                      >
                        Classificação completa
                      </h2>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[52px] p-2 sm:w-[80px] sm:p-4">
                            Posição
                          </TableHead>
                          <TableHead>Usuário</TableHead>
                          {/* A coluna de tarefas sai abaixo de `sm`: o número que esta tela promete é o
                            placar do mês, e ele não pode ficar atrás de uma rolagem horizontal. No mês
                            fechado a contagem é a de hoje (INV3 não toca acumulativos), e o rótulo diz
                            isso em vez de deixar ler "tarefas daquele mês". */}
                          <TableHead className="hidden sm:table-cell">
                            {closedBoardReady
                              ? "Tarefas cumulativas"
                              : "Tarefas concluídas"}
                          </TableHead>
                          <TableHead className="text-right">
                            Pontos do mês
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* O top 3 ja esta no podio (campeao + 2º/3º) — a tabela comeca no 4º. No mes
                          fechado a posição é a que o fechamento gravou, não uma recontagem. */}
                        {remainingUsers.map((rankedUser) => (
                          <TableRow
                            key={rankedUser.id}
                            className={
                              rankedUser.id === user.id ? "bg-primary/5" : ""
                            }
                          >
                            <TableCell className="p-2 font-semibold tabular-nums text-muted-foreground sm:p-4">
                              {rankedUser.position}º
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/dashboard/profile?userId=${rankedUser.id}`}
                                className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <BucketAvatar
                                  userId={rankedUser.id}
                                  avatarKey={rankedUser.avatarKey}
                                  legacyAvatar={rankedUser.avatar}
                                  name={rankedUser.name}
                                  className="h-9 w-9"
                                  fallback={getInitials(rankedUser.name)}
                                />
                                <div>
                                  <p className="font-medium">
                                    {rankedUser.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {getRoleLabel(rankedUser.roles || [])}
                                  </p>
                                </div>
                              </Link>
                            </TableCell>
                            <TableCell className="hidden p-2 tabular-nums sm:table-cell sm:p-4">
                              {rankedUser.completedTasks ?? "—"}
                            </TableCell>
                            <TableCell className="p-2 text-right font-bold tabular-nums sm:p-4">
                              {rankedUser.value}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
