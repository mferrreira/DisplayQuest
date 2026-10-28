"use client"

/**
 * /dashboard/profile — plan-v6 · V6-7 (Perfil + Ranking).
 *
 * Reimaginacao: o perfil nao e uma grade de caixas. A identidade e um plano unico com a capa e o
 * avatar sobrepostos; os numeros sao uma faixa de fatos (rotulo quieto + algarismo grande) apoiada
 * em reguas finas, sem borda em volta de cada um; as abas e as conquistas vivem em secoes abertas.
 * O pouco de cor sai de tokens com significado (a tinta do hero, o ouro do ranking).
 *
 * O ranking e filho do perfil: a posicao sai da lista de usuarios que a pagina ja carrega e aponta
 * para `/dashboard/leaderboard`. Nenhum dado novo e buscado por causa do desenho.
 */
import { Suspense, useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useDailyLogs } from "@/hooks/use-daily-logs"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useProject } from "@/contexts/project-context"
import { DailyLogList } from "@/components/ui/daily-log-list"
import { UserProfileView } from "@/components/ui/user-profile-view"
import { UserMediaHeader } from "@/components/features/user-media-header"
import { ProfilePictureUpload } from "@/components/forms/profile-picture-upload"
import { UserProfileForm } from "@/components/forms/user-profile-form"
import { PageHeader } from "@/components/ui/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserBadges } from "@/components/ui/user-badges"
import { TimerCard } from "@/components/ui/timer-card"
import { getRoleDisplayName } from "@/lib/utils/access-control"
import { compareByBoardPosition } from "@/backend/domain"
import { ProfileMonthsList } from "@/components/ui/profile-months-list"
import { useWorkSessions } from "@/hooks/use-work-sessions"
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  Settings,
  Trophy,
  User as UserIcon,
} from "lucide-react"
import type { User } from "@/contexts/types"

function Fact({
  label,
  value,
  hint,
  action,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="border-t border-border pt-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-3xl font-bold tabular-nums leading-none">{value}</dd>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

function ProfilePageContent() {
  const { user: authUser } = useAuth()
  const { users } = useUser()
  const { projects } = useProject()
  const searchParams = useSearchParams()
  const { logs } = useDailyLogs()
  const { sessions, getWeeklyHours, fetchSessions } = useWorkSessions()
  const [user, setUser] = useState<User | null>(authUser)
  const [weeklyHours, setWeeklyHours] = useState<number>(0)
  const [viewingUser, setViewingUser] = useState<User | null>(null)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [activeTab, setActiveTab] = useState("activity")

  const today = new Date()

  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  useEffect(() => {
    if (authUser) {
      setUser(authUser)
    }
  }, [authUser])

  useEffect(() => {
    const selectedUserId = searchParams.get("userId")
    if (!selectedUserId) {
      setViewingUser(null)
      return
    }

    const selectedUser = users.find((candidate) => candidate.id === Number(selectedUserId)) || null
    setViewingUser(selectedUser)
  }, [searchParams, users])

  useEffect(() => {
    if (user) {
      getWeeklyHours(user.id, monday.toISOString(), sunday.toISOString()).then(setWeeklyHours)
    }
  }, [user, sessions, getWeeklyHours, monday, sunday])

  const handleBackToProfile = () => {
    setViewingUser(null)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.delete("userId")
      window.history.replaceState({}, "", url.toString())
    }
  }

  const toggleProfileForm = () => {
    const next = !showProfileForm
    setShowProfileForm(next)
    if (next) setActiveTab("settings")
  }

  const progressoSemanal = weeklyHours
  const metaSemanal = user?.weekHours ?? 0

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center p-4 md:p-6">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Carregando perfil...</p>
          </div>
        </main>
      </div>
    )
  }

  if (viewingUser) {
    const viewingUserProjects = projects
      .filter((project) => project.members?.some((member) => member.userId === viewingUser.id) || project.leaderId === viewingUser.id)
      .map((project) => project.name)

    return (
      <div className="flex min-h-screen flex-col">
        <main className="container mx-auto flex-1 p-4 md:p-6">
          <UserProfileView
            user={viewingUser}
            onBack={handleBackToProfile}
            canEdit={false}
            projectNames={viewingUserProjects}
          />
        </main>
      </div>
    )
  }

  const initials = user.name
    ? user.name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2)
    : "U"
  const myProjects = projects.filter(
    (project) => project.leaderId === user.id || project.members?.some((member) => member.userId === user.id),
  )
  // plan-v9 S04 (DEC-232): a posição do perfil é a posição do MÊS, a mesma régua do quadro vivo
  // (ADR-005): valor desc, depois nome, depois id. Antes ordenava pelo saldo acumulado, e perfil
  // e quadro anunciavam postos diferentes no mesmo instante.
  const rankedUsers = [...users].sort((left, right) =>
    compareByBoardPosition(
      { id: left.id, name: left.name, currentMonthPoints: left.currentMonthPoints ?? 0 },
      { id: right.id, name: right.name, currentMonthPoints: right.currentMonthPoints ?? 0 },
    ),
  )
  // plan-v9 S04 (fix pós-review): o placar do mês vem da LISTA (currentMonthPoints), não da
  // sessão — o session callback não carrega o campo, e ler de `user` aqui congelava o Fato em 0
  // enquanto o quadro do mesmo instante mostrava o valor real (achado nas capturas, ui-reviewer
  // B1). Mesma lista do rank, nenhuma busca nova; o cabeçalho passa a ler a mesma fonte na S06
  // (DEC-229).
  const myListIndex = rankedUsers.findIndex((candidate) => candidate.id === user.id)
  const myEntry = myListIndex >= 0 ? rankedUsers[myListIndex] : undefined
  const myRank = myListIndex + 1
  const monthPoints = myEntry?.currentMonthPoints ?? 0

  const goalPercent = metaSemanal > 0 ? Math.min(100, Math.round((progressoSemanal / metaSemanal) * 100)) : 0
  const goalRemaining = metaSemanal - progressoSemanal
  const goalHint =
    metaSemanal <= 0
      ? "Sem meta definida"
      : goalRemaining > 0
        ? `Faltam ${goalRemaining.toFixed(1)} h`
        : goalRemaining < 0
          ? `${Math.abs(goalRemaining).toFixed(1)} h além da meta`
          : "Meta atingida"

  return (
    <div className="flex min-h-screen flex-col">
      <main className="container mx-auto flex-1 p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <PageHeader
            title="Meu Perfil"
            description="Suas informações, sua capa de perfil e a atividade da semana."
            icon={UserIcon}
            actions={
              <Button variant={showProfileForm ? "default" : "outline"} size="sm" onClick={toggleProfileForm}>
                {showProfileForm ? "Cancelar Edição" : "Editar Perfil"}
              </Button>
            }
          />

          {/* Identidade — um plano so: capa, avatar sobreposto, nome e funcoes. */}
          <section className="overflow-hidden rounded-2xl border border-border">
            <div className="relative">
              <UserMediaHeader
                userId={user.id}
                userName={user.name}
                bannerKey={user.bannerKey}
                canEdit
                onBannerChange={(bannerKey) => setUser({ ...user, bannerKey })}
              />
              <Avatar className="absolute bottom-0 left-6 h-24 w-24 translate-y-1/3 border-4 border-background bg-background sm:h-28 sm:w-28">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback className="text-2xl font-bold">{initials}</AvatarFallback>
              </Avatar>
            </div>

            <div className="flex flex-col gap-3 px-6 pb-6 pt-16 sm:flex-row sm:items-end sm:justify-between sm:px-8">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {user.name}
                  </h2>
                  {showProfileForm && <Badge variant="secondary">Editando</Badge>}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
              {user.roles.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {user.roles.map(getRoleDisplayName).join(" · ")}
                </p>
              )}
            </div>
          </section>

          {/* Fatos — rotulo quieto + algarismo grande sobre a regua, sem caixa. */}
          <dl aria-label="Resumo do perfil" className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            <Fact label="Placar do mês" value={monthPoints} hint="zera na virada" />
            <Fact label="Pontos" value={user.points} hint="acumulados" />
            <Fact label="Tarefas" value={user.completedTasks} hint="concluídas" />
            <Fact
              label="Horas na semana"
              value={`${progressoSemanal.toFixed(1)} h`}
              hint={metaSemanal > 0 ? `meta de ${metaSemanal} h` : "sem meta"}
            />
            <Fact
              label="Posição"
              value={myRank > 0 ? `${myRank}º` : "—"}
              hint={`do mês, de ${rankedUsers.length} pessoas`}
              action={
                <Link href="/dashboard/leaderboard" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Ver ranking
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
          </dl>

          {/* plan-v9 S04 (§7, DEC-232): os meses fechados da pessoa, com estado vazio quando
              nenhum mês fechou ainda. O placar do mês em curso vive no Fato acima; aqui é
              histórico, do mais recente ao mais antigo. */}
          <section aria-labelledby="profile-months">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 id="profile-months" className="text-sm font-semibold">
                Meses fechados
              </h2>
            </div>
            <ProfileMonthsList userId={user.id} />
          </section>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="activity" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                <span>Atividade</span>
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <span>Logs Diários</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span>Configurações</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="space-y-6">
              {/* Meta da semana — mesma linguagem da Home: rotulo, algarismo, fio de progresso. */}
              <section aria-labelledby="profile-weekly-goal">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 id="profile-weekly-goal" className="text-sm font-semibold">
                    Meta da semana
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">{progressoSemanal.toFixed(1)} h</span>
                    {metaSemanal > 0 ? ` / ${metaSemanal} h` : ""}
                  </p>
                </div>
                <Progress value={goalPercent} className="h-2" aria-label={`Meta semanal de horas: ${goalPercent}%`} />
                <p className="mt-2 text-xs text-muted-foreground">{goalHint}</p>
              </section>

              <TimerCard
                onSessionEnd={() => {
                  if (user?.id) fetchSessions(user.id)
                }}
              />
            </TabsContent>

            <TabsContent value="logs" className="space-y-6">
              <section aria-labelledby="profile-daily-logs" className="space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h2 id="profile-daily-logs" className="text-sm font-semibold">
                    Registros Diários
                  </h2>
                </div>
                <div className="rounded-md border border-info/30 bg-info/10 p-3 text-sm text-info">
                  Registros diários agora são gerados no encerramento da Work Session.
                </div>
                <DailyLogList logs={logs} currentUser={user} isSubmitting={false} />
              </section>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              {showProfileForm && user ? (
                <div className="space-y-6">
                  <ProfilePictureUpload user={user} onUpdate={(updatedUser) => setUser(updatedUser)} />
                  <UserProfileForm
                    user={user}
                    onUpdate={(updatedUser) => {
                      setUser(updatedUser)
                      setShowProfileForm(false)
                    }}
                    onCancel={() => setShowProfileForm(false)}
                  />
                </div>
              ) : (
                <section aria-labelledby="profile-info" className="space-y-4">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h2 id="profile-info" className="text-sm font-semibold">
                      Informações do Perfil
                    </h2>
                  </div>
                  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    <div className="border-t border-border pt-3">
                      <dt>
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nome</Label>
                      </dt>
                      <dd className="text-sm text-foreground">{user.name}</dd>
                    </div>
                    <div className="border-t border-border pt-3">
                      <dt>
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</Label>
                      </dt>
                      <dd className="text-sm text-foreground">{user.email}</dd>
                    </div>
                    <div className="border-t border-border pt-3">
                      <dt>
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biografia</Label>
                      </dt>
                      <dd className="text-sm text-foreground">{user.bio || "Nenhuma biografia definida"}</dd>
                    </div>
                    <div className="border-t border-border pt-3">
                      <dt>
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Visibilidade do Perfil
                        </Label>
                      </dt>
                      <dd className="text-sm text-foreground">
                        {user.profileVisibility === "public" && "Público"}
                        {user.profileVisibility === "members_only" && "Apenas Membros"}
                        {user.profileVisibility === "private" && "Privado"}
                      </dd>
                    </div>
                    <div className="border-t border-border pt-3">
                      <dt>
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Horas Semanais
                        </Label>
                      </dt>
                      <dd className="text-sm text-foreground">{user.weekHours} horas</dd>
                    </div>
                  </dl>
                </section>
              )}
            </TabsContent>
          </Tabs>

          <div className="border-t border-border pt-6">
            <UserBadges userId={user.id} limit={8} />
          </div>
        </div>
      </main>
    </div>
  )
}

function ProfilePageFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center p-4 md:p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Carregando perfil...</p>
        </div>
      </main>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfilePageFallback />}>
      <ProfilePageContent />
    </Suspense>
  )
}
