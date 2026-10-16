"use client"

/**
 * /dashboard/leaderboard — plan-v6 · V6-7 (Perfil + Ranking).
 *
 * Reimaginacao: o ranking nao e uma grade de caixas. A posicao pessoal e um bloco aberto (algarismo
 * grande + fio de progresso), o campeao e a unica superficie com tinta (o ouro tem significado), o
 * 2º/3º sao colunas tipograficas e a classificacao e uma tabela solta — sem `Card` em volta de nada.
 * Os dados sao os que a tela ja carrega (`useUser`); nenhuma busca nova entra aqui.
 */
import Link from "next/link"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Crown, Medal, Award, Trophy } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { userImageUrl } from "@/lib/api/user-images"
import { getRoleDisplayName } from "@/lib/utils/access-control"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function LeaderboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { users } = useUser()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  const sortedUsers = [...users].sort((left, right) => (right.points ?? 0) - (left.points ?? 0))

  const currentUserRank = sortedUsers.findIndex((rankedUser) => rankedUser.id === user?.id) + 1

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)

  const getRoleLabel = (roles: string[]) => roles.map(getRoleDisplayName).join(", ")

  const podiumUsers = sortedUsers.slice(0, 3)
  const remainingUsers = sortedUsers.slice(3)

  const leader = sortedUsers[0]
  const leaderPoints = leader?.points ?? 0
  const myPoints = user?.points ?? 0
  const pathPercent =
    leaderPoints > 0 ? Math.max(0, Math.min(100, Math.round((myPoints / leaderPoints) * 100))) : 0
  const rival = currentUserRank > 1 ? sortedUsers[currentUserRank - 2] : undefined
  const gapToRival = rival ? (rival.points ?? 0) - myPoints : 0

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
        ? `Faltam ${gapToRival} pts para alcançar ${rival.name}.`
        : rival
          ? `Empatado com ${rival.name}.`
          : `Líder: ${leader?.name} com ${leaderPoints} pts.`

  const champion = podiumUsers[0]
  const runnersUp = podiumUsers.slice(1)

  return (
    <div className="flex min-h-screen flex-col">
      <main className="container mx-auto flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <PageHeader
            title="Quadro de Liderança"
            description="Acompanhe quem mais pontuou e abra o perfil de cada pessoa."
            icon={Trophy}
          />

          {/* Sua posição — algarismo grande sobre a régua, sem caixa em volta. */}
          <section
            aria-label="Sua posição"
            className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6"
          >
            <div>
              <p className="text-sm text-muted-foreground">Sua posição</p>
              <p className="mt-1 text-5xl font-bold tabular-nums leading-none">
                {currentUserRank > 0 ? `${currentUserRank}º` : "—"}
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  de {sortedUsers.length}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {myPoints} pontos · {user.completedTasks} {user.completedTasks === 1 ? "tarefa" : "tarefas"} concluídas
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
            <section aria-label="Campeão do quadro">
              <Link
                href={`/dashboard/profile?userId=${champion.id}`}
                className="relative block overflow-hidden rounded-2xl border border-warning/30 bg-warning/5 transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <div className="relative flex flex-wrap items-center gap-5 p-6">
                  <Crown className="h-8 w-8 shrink-0 text-warning" aria-hidden="true" />
                  <Avatar className="h-16 w-16 border-2 border-warning/50">
                    <AvatarImage src={champion.avatar || undefined} alt={champion.name} />
                    <AvatarFallback className="text-lg font-bold">{getInitials(champion.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warning">1º lugar</p>
                    <p className="truncate text-xl font-bold text-foreground">{champion.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {getRoleLabel(champion.roles || []) || "Membro do laboratório"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold tabular-nums text-foreground">{champion.points}</p>
                    <p className="text-xs text-muted-foreground">pontos</p>
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
              {runnersUp.map((runnerUp, index) => {
                const position = index + 2
                const Icon = position === 2 ? Medal : Award
                const accent = position === 2 ? "text-muted-foreground" : "text-warning"
                return (
                  <Link
                    key={runnerUp.id}
                    href={`/dashboard/profile?userId=${runnerUp.id}`}
                    className={`flex items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      position === 2 ? "sm:pr-8" : "sm:pl-8"
                    }`}
                  >
                    <span className={`text-3xl font-bold tabular-nums ${accent}`} aria-hidden="true">
                      {position}º
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
                  <TableHead className="w-[80px]">Posição</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tarefas concluídas</TableHead>
                  <TableHead className="text-right">Pontos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {podiumUsers.map((rankedUser, index) => (
                  <TableRow key={rankedUser.id} className={rankedUser.id === user.id ? "bg-primary/5" : ""}>
                    <TableCell className="font-semibold tabular-nums text-muted-foreground">{index + 1}º</TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/profile?userId=${rankedUser.id}`}
                        className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/60"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={rankedUser.avatar || undefined} alt={rankedUser.name} />
                          <AvatarFallback>{getInitials(rankedUser.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{rankedUser.name}</p>
                          <p className="text-xs text-muted-foreground">{getRoleLabel(rankedUser.roles || [])}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{rankedUser.completedTasks}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{rankedUser.points}</TableCell>
                  </TableRow>
                ))}
                {remainingUsers.map((rankedUser, index) => (
                  <TableRow key={rankedUser.id} className={rankedUser.id === user.id ? "bg-primary/5" : ""}>
                    <TableCell className="font-semibold tabular-nums text-muted-foreground">{index + 4}º</TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/profile?userId=${rankedUser.id}`}
                        className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/60"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={rankedUser.avatar || undefined} alt={rankedUser.name} />
                          <AvatarFallback>{getInitials(rankedUser.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{rankedUser.name}</p>
                          <p className="text-xs text-muted-foreground">{getRoleLabel(rankedUser.roles || [])}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{rankedUser.completedTasks}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{rankedUser.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </div>
      </main>
    </div>
  )
}
