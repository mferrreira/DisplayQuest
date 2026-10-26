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
 */
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Crown, Medal, Award, Trophy } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { userImageUrl } from "@/lib/api/user-images"
import { getRoleDisplayName } from "@/lib/utils/access-control"
import { PageHeader } from "@/components/ui/page-header"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchAPI } from "@/contexts/api-client"

/** O que `GET /api/board` declara (S01: mês corrente; S03 acrescenta a lista de meses fechados). */
interface BoardMonth {
  month: string;
  monthLabel: string;
  closedMonths?: Array<{ month: string; monthLabel: string }>;
}

/** O que `GET /api/board?month=AAAA-MM` devolve (S03, CA4, CA8, R9). */
interface BoardMonthRead {
  month: string;
  monthLabel: string;
  closed: boolean;
  /** true quando o mês pedido é o em curso: o quadro se resolve pelo placar vivo (R9). */
  live: boolean;
  notice: string;
  entries: Array<{ userId: number; name: string; value: number; position: number }>;
}

/** Linha do quadro, vinda do placar vivo ou de um fechamento. A tela renderiza as duas iguais. */
interface BoardEntry {
  id: number;
  name: string;
  value: number;
  position: number;
  avatar?: string | null;
  bannerKey?: string | null;
  roles?: string[];
  completedTasks?: number;
}

/** Sentinela da casa para "sem mês escolhido": o quadro vivo. Nunca `""` (Select do Radix). */
const CURRENT_MONTH = "current"

export default function LeaderboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { users } = useUser()

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

  // plan-v9 (ADR-001, DEC-224): o quadro ordena pelo placar do mês. `points` é saldo e não decide ordem.
  const monthScore = (candidate: { currentMonthPoints?: number }) => candidate.currentMonthPoints ?? 0

  const sortedUsers = [...users].sort((left, right) => monthScore(right) - monthScore(left))

  const currentUserIndex = sortedUsers.findIndex((rankedUser) => rankedUser.id === user?.id)
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

  const getRoleLabel = (roles: string[]) => roles.map(getRoleDisplayName).join(", ")

  // Uma leitura de mês nomeado só congela o quadro quando o servidor devolve linhas de fechamento.
  // `live` (R9) e falha de leitura não congelam: o quadro é o de hoje, declarado como tal.
  const selectedClosedMonth =
    selectedMonth !== CURRENT_MONTH && closedBoard !== null && closedBoard.closed && !closedBoard.live
  const closedBoardFailed = selectedMonth !== CURRENT_MONTH && closedBoardError
  const closedBoardPending = selectedMonth !== CURRENT_MONTH && closedBoard === null && !closedBoardError
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
        roles: rankedUser.roles,
        completedTasks: rankedUser.completedTasks,
      }))

  const leader = entries[0]
  const leaderPoints = leader ? leader.value : 0
  const myPoints = myEntry ? monthScore(myEntry) : 0
  const pathPercent =
    leaderPoints > 0 ? Math.max(0, Math.min(100, Math.round((myPoints / leaderPoints) * 100))) : 0
  const rival = currentUserRank > 1 ? sortedUsers[currentUserRank - 2] : undefined
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

  const monthSelector = (
    <Select value={selectedMonth} onValueChange={(value) => setSelectedMonth(value)}>
      <SelectTrigger className="w-[190px] sm:w-[220px]" aria-label="Mês do quadro">
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

  // O aviso do mês tem um ramo por estado da leitura, e nenhum deles nomeia o mês errado: pendant
  // o mês em curso, na falha e no vazio o mês pedido. Dizer "Placar de outubro de 2026" enquanto o
  // quadro embaixo lê junho de 2027 é a mesma mentira que a CA4 e a CA8 existem para pegar.
  // `month_history` nao guarda mes em texto por pessoa: o rotulo vem do servidor. Na falha de
  // leitura o que resta e o rotulo da lista de meses fechados, nunca o `AAAA-MM` cru.
  const closedMonthLabel =
    closedBoard?.monthLabel ??
    boardMonth?.closedMonths?.find((closedMonth) => closedMonth.month === selectedMonth)?.monthLabel ??
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
          <PageHeader
            title="Quadro de Liderança"
            description={monthDescription}
            icon={Trophy}
            actions={monthSelector}
          />

          {/* Sua posição — só no mês em curso. Mês fechado não tem progresso contra o líder de hoje. */}
          {!closedBoardReady && !closedBoardPending && !closedBoardFailed && (
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
              <p className="text-muted-foreground">Lendo o quadro fechado de {closedMonthLabel}...</p>
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
          ) : (
            // Quadro vivo e fechado-com-linhas dividem o mesmo corpo. No fechado o wrapper é região
            // viva (role="status"): trocar de mês precisa ser anunciado também quando há linhas —
            // pending, fail e vazio já o têm. O "space-y-8" sobe para o wrapper para o ritmo entre
            // campeão, 2º/3º e tabela não mudar em nenhum dos dois caminhos.
            <div
              role={closedBoardReady ? "status" : undefined}
              aria-label={closedBoardReady ? "Quadro do mês fechado" : undefined}
              className="space-y-8"
            >
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
                    <div className="relative flex flex-wrap items-center gap-4 p-5 sm:gap-6 sm:p-8">
                      <Crown className="h-8 w-8 shrink-0 text-warning sm:h-10 sm:w-10" aria-hidden="true" />
                      <Avatar className="h-14 w-14 border-2 border-warning/50 sm:h-20 sm:w-20">
                        <AvatarImage src={champion.avatar || undefined} alt={champion.name} />
                        <AvatarFallback className="text-lg font-bold sm:text-xl">{getInitials(champion.name)}</AvatarFallback>
                      </Avatar>
                      {/* Uma palavra só (nome de uma palavra, ou o nome congelado no fechamento) não
                          quebra sozinha e invadia o número ao lado — medido em 390px: "Coordenador" mede
                          129px contra 110px de caixa, e o `240` colava no nome. `hyphens-auto` quebra na
                          sílaba ("Coordena-dor") porque `<html lang="pt-BR">` já existe; `break-words` é a
                          rede de segurança quando o navegador não tem dicionário para o idioma; o bloco do
                          número é `shrink-0` para o placar nunca ser espremido (mesma família do valor que
                          explodia no cartão de tarefa). */}
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
                        key={runnerUp.id}
                        href={`/dashboard/profile?userId=${runnerUp.id}`}
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
                        <p className="shrink-0 font-bold tabular-nums text-foreground">{runnerUp.value}</p>
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
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[52px] p-2 sm:w-[80px] sm:p-4">Posição</TableHead>
                      <TableHead>Usuário</TableHead>
                      {/* A coluna de tarefas sai abaixo de `sm`: o número que esta tela promete é o
                          placar do mês, e ele não pode ficar atrás de uma rolagem horizontal. No mês
                          fechado a contagem é a de hoje (INV3 não toca acumulativos), e o rótulo diz
                          isso em vez de deixar ler "tarefas daquele mês". */}
                      <TableHead className="hidden sm:table-cell">
                        {closedBoardReady ? "Tarefas cumulativas" : "Tarefas concluídas"}
                      </TableHead>
                      <TableHead className="text-right">Pontos do mês</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* O top 3 ja esta no podio (campeao + 2º/3º) — a tabela comeca no 4º. No mes
                        fechado a posição é a que o fechamento gravou, não uma recontagem. */}
                    {remainingUsers.map((rankedUser) => (
                      <TableRow key={rankedUser.id} className={rankedUser.id === user.id ? "bg-primary/5" : ""}>
                        <TableCell className="p-2 font-semibold tabular-nums text-muted-foreground sm:p-4">
                          {rankedUser.position}º
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dashboard/profile?userId=${rankedUser.id}`}
                            className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <TableCell className="hidden p-2 tabular-nums sm:table-cell sm:p-4">
                          {rankedUser.completedTasks ?? "—"}
                        </TableCell>
                        <TableCell className="p-2 text-right font-bold tabular-nums sm:p-4">{rankedUser.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
